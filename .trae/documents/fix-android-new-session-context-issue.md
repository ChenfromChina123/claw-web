# 安卓App新建会话上下文复用问题修复计划

## 问题描述

在安卓App中，当用户点击"新建会话"按钮时，App没有真正创建一个新的空白会话，而是复用了之前已有的空会话（如果存在的话）。这导致新会话继承了旧会话的上下文（如用户之前提到的名字"牢大"），而不是从一个全新的空白状态开始。

从截图可以看到：
1. 用户之前在一个会话中说"我是牢大"
2. 用户新建会话后发送"你好"
3. AI回复"你好，牢大！"，说明AI仍然记得之前会话中的信息

## 根本原因分析

### 问题流程分析

1. **App端新建会话流程**：
   - 用户点击"新建会话"按钮
   - `SessionViewModel.createNewSession()` 被调用
   - 该方法检查 `_localOnlySessions`，如果有未发送消息的本地临时会话，则复用它
   - 如果没有，则创建一个新的本地临时会话（仅客户端存在，未同步到后端）

2. **发送第一条消息时的流程**：
   - `ChatViewModel.sendMessage()` 被调用
   - 调用 `ensureSession()` 检查当前会话
   - 如果是本地临时会话（`isLocalOnlySession = true`），调用 `onConvertLocalSession` 回调
   - `SessionViewModel.createRealSession()` 被调用，调用后端API `POST /api/sessions` 创建真实会话

3. **后端创建会话的问题**：
   - 后端 `sessionManager.createSession()` 方法默认 `force = false`
   - 调用 `sessionRepo.findOrCreateEmptySession()` 查找或创建空会话
   - **关键问题**：`findOrCreateEmptySession` 会优先查找用户已有的空会话（`is_empty = TRUE`）并复用它
   - 这个被复用的空会话可能之前有过消息（后来被清空），或者存在其他问题

4. **消息处理的问题**：
   - `sessionConversationManager.processMessage()` 被调用
   - 调用 `sessionManager.getMessagesForAI(sessionId)` 获取会话的历史消息
   - **问题**：即使会话标记为 `is_empty = TRUE`，数据库中可能仍然残留了之前的历史消息

### 真正的问题所在

**问题1：数据库中 `is_empty` 标记与消息数据不一致**

在 `sessionRepository.ts` 中的 `findOrCreateEmptySession` 方法：
```typescript
async findOrCreateEmptySession(userId: string, title: string = '新对话', model: string = 'qwen-plus'): Promise<Session> {
  // ...
  // 1. 先查找是否已有空会话（FOR UPDATE 锁防止并发插入）
  const [result] = await connection.query(
    `SELECT * FROM sessions 
     WHERE user_id = ? AND is_empty = TRUE 
     ORDER BY updated_at DESC 
     LIMIT 1
     FOR UPDATE`,
    [userId]
  )
  // ...
}
```

这个方法只检查 `sessions` 表的 `is_empty` 字段，但不验证 `messages` 表是否真的没有消息。

**问题2：`is_empty` 标记没有正确维护**

- 当会话的消息被清空时（如调用 `clearSession`），`is_empty` 没有被重置为 `TRUE`
- 当会话被回滚到某条消息时，`is_empty` 状态可能没有正确更新

**问题3：复用的"空会话"实际上有历史消息**

当 `findOrCreateEmptySession` 返回一个 `is_empty = TRUE` 的会话时，这个会话可能：
1. 确实有0条消息（真正的新会话）
2. 之前有消息，后来被删除，但 `is_empty` 没有正确更新
3. 消息被清空，但 `is_empty` 仍为 `TRUE`

## 修复方案

### 方案1：修复 `findOrCreateEmptySession` 方法，验证消息数量（推荐）

修改 `sessionRepository.ts` 中的 `findOrCreateEmptySession` 方法，不仅检查 `is_empty` 字段，还要验证 `messages` 表是否真的没有消息：

```typescript
async findOrCreateEmptySession(userId: string, title: string = '新对话', model: string = 'qwen-plus'): Promise<Session> {
  const pool = getPool() as Pool
  const connection = await pool.getConnection()
  
  try {
    await connection.beginTransaction()
    
    // 1. 查找候选空会话
    let rows: any[] = []
    try {
      const [result] = await connection.query(
        `SELECT s.* FROM sessions s
         WHERE s.user_id = ? AND s.is_empty = TRUE 
         ORDER BY s.updated_at DESC 
         LIMIT 1
         FOR UPDATE`,
        [userId]
      )
      rows = result as any[]
    } catch (error) {
      // Fallback to LEFT JOIN if is_empty column doesn't exist
      const [result] = await connection.query(
        `SELECT s.* FROM sessions s 
         LEFT JOIN messages m ON s.id = m.session_id 
         WHERE s.user_id = ? AND m.id IS NULL 
         ORDER BY s.updated_at DESC 
         LIMIT 1
         FOR UPDATE`,
        [userId]
      )
      rows = result as any[]
    }

    // 2. 验证候选会话确实没有消息
    if (rows.length > 0) {
      const candidateSessionId = rows[0].id
      const [messageRows] = await connection.query(
        `SELECT COUNT(*) as count FROM messages WHERE session_id = ?`,
        [candidateSessionId]
      )
      const messageCount = (messageRows as any[])[0]?.count || 0
      
      if (messageCount === 0) {
        // 确实没有消息，可以复用
        await connection.commit()
        console.log(`[SessionRepo] findOrCreateEmptySession: 找到真正空的会话 ${candidateSessionId}`)
        return this.mapToSession(rows[0])
      } else {
        // 有消息但标记为 is_empty，修复标记
        console.warn(`[SessionRepo] 会话 ${candidateSessionId} 标记为 is_empty 但有 ${messageCount} 条消息，修复标记`)
        try {
          await connection.query(
            `UPDATE sessions SET is_empty = FALSE WHERE id = ?`,
            [candidateSessionId]
          )
        } catch (e) {
          // Ignore if is_empty column doesn't exist
        }
        // 继续创建新会话
      }
    }

    // 3. 没有真正空的会话，创建新的
    const id = uuidv4()
    await connection.query(
      'INSERT INTO sessions (id, user_id, title, model, is_empty) VALUES (?, ?, ?, ?, TRUE)',
      [id, userId, title, model]
    )

    const [newRows] = await connection.query(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    ) as [Session[], unknown]

    await connection.commit()
    console.log(`[SessionRepo] findOrCreateEmptySession: 创建新会话 ${id}`)
    return this.mapToSession(newRows[0])
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
```

### 方案2：使用 LEFT JOIN 查询替代 is_empty 字段

完全依赖 `LEFT JOIN` 查询来查找真正的空会话，而不是依赖 `is_empty` 字段：

```typescript
async findOrCreateEmptySession(userId: string, title: string = '新对话', model: string = 'qwen-plus'): Promise<Session> {
  const pool = getPool() as Pool
  const connection = await pool.getConnection()
  
  try {
    await connection.beginTransaction()
    
    // 直接使用 LEFT JOIN 查询真正的空会话（没有关联消息的会话）
    const [result] = await connection.query(
      `SELECT s.* FROM sessions s 
       LEFT JOIN messages m ON s.id = m.session_id 
       WHERE s.user_id = ? AND m.id IS NULL 
       ORDER BY s.updated_at DESC 
       LIMIT 1
       FOR UPDATE`,
      [userId]
    )
    const rows = result as any[]

    if (rows.length > 0) {
      await connection.commit()
      console.log(`[SessionRepo] findOrCreateEmptySession: 找到空会话 ${rows[0].id}`)
      return this.mapToSession(rows[0])
    }

    // 没有空会话，创建新的
    const id = uuidv4()
    await connection.query(
      'INSERT INTO sessions (id, user_id, title, model, is_empty) VALUES (?, ?, ?, ?, TRUE)',
      [id, userId, title, model]
    )

    const [newRows] = await connection.query(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    ) as [Session[], unknown]

    await connection.commit()
    console.log(`[SessionRepo] findOrCreateEmptySession: 创建新会话 ${id}`)
    return this.mapToSession(newRows[0])
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
```

### 方案3：修复 clearSession 和 rollback 方法，正确维护 is_empty 标记

确保在清空会话或回滚会话时，正确更新 `is_empty` 标记：

```typescript
// 在 sessionRepository.ts 中添加
async markAsEmpty(sessionId: string): Promise<void> {
  const pool = getPool() as Pool
  try {
    await pool.query(
      'UPDATE sessions SET is_empty = TRUE WHERE id = ?',
      [sessionId]
    )
  } catch (error) {
    console.warn('[SessionRepo] 标记会话为空失败:', error)
  }
}
```

然后在 `sessionManager.clearSession()` 中调用：
```typescript
async clearSession(sessionId: string): Promise<void> {
  await this.messageRepo.deleteBySessionId(sessionId)
  await this.toolCallRepo.deleteBySessionId(sessionId)
  
  // 标记会话为空
  await this.sessionRepo.markAsEmpty(sessionId)

  const sessionData = this.sessions.get(sessionId)
  if (sessionData) {
    sessionData.messages = []
    sessionData.toolCalls = []
    sessionData.dirty = true
  }
}
```

## 推荐方案

**采用方案2：使用 LEFT JOIN 查询替代 is_empty 字段**

理由：
1. **数据一致性**：直接查询 `messages` 表，确保返回的会话确实没有消息
2. **简单可靠**：不依赖 `is_empty` 字段的维护，避免标记与数据不一致的问题
3. **向后兼容**：`is_empty` 字段仍然存在，只是不作为主要判断依据

## 实施步骤

1. **修改 `sessionRepository.ts`**
   - 修改 `findOrCreateEmptySession` 方法，使用 LEFT JOIN 查询真正的空会话
   - 移除对 `is_empty` 字段的依赖

2. **验证修复**
   - 在App中测试：
     a. 在一个会话中告诉AI"我是牢大"
     b. 新建会话，发送"你好"
     c. 验证AI回复是否包含"牢大"（修复后应该不包含）

3. **可选：清理不一致的数据**
   - 可以添加一个迁移脚本，清理 `is_empty = TRUE` 但实际有消息的会话标记

## 代码修改详情

### 修改文件：`server/src/master/db/repositories/sessionRepository.ts`

```typescript
async findOrCreateEmptySession(userId: string, title: string = '新对话', model: string = 'qwen-plus'): Promise<Session> {
  const pool = getPool() as Pool
  const connection = await pool.getConnection()
  
  try {
    await connection.beginTransaction()
    
    // 直接使用 LEFT JOIN 查询真正的空会话（没有关联消息的会话）
    const [result] = await connection.query(
      `SELECT s.* FROM sessions s 
       LEFT JOIN messages m ON s.id = m.session_id 
       WHERE s.user_id = ? AND m.id IS NULL 
       ORDER BY s.updated_at DESC 
       LIMIT 1
       FOR UPDATE`,
      [userId]
    )
    const rows = result as any[]

    if (rows.length > 0) {
      await connection.commit()
      console.log(`[SessionRepo] findOrCreateEmptySession: 找到空会话 ${rows[0].id}`)
      return this.mapToSession(rows[0])
    }

    // 没有空会话，创建新的
    const id = uuidv4()
    await connection.query(
      'INSERT INTO sessions (id, user_id, title, model, is_empty) VALUES (?, ?, ?, ?, TRUE)',
      [id, userId, title, model]
    )

    const [newRows] = await connection.query(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    ) as [Session[], unknown]

    await connection.commit()
    console.log(`[SessionRepo] findOrCreateEmptySession: 创建新会话 ${id}`)
    return this.mapToSession(newRows[0])
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
```

## 影响评估

### 正面影响
- 修复新建会话上下文复用问题
- 提升用户体验，符合用户预期
- 数据一致性更好

### 潜在影响
- LEFT JOIN 查询可能比单纯的 `is_empty` 字段查询稍慢（但影响很小，因为空会话数量通常很少）

### 缓解措施
- 可以为 `messages.session_id` 添加索引，优化查询性能
