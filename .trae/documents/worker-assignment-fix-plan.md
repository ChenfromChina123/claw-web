# Worker 分配问题分析与修复计划

## 问题描述

用户反馈：一个用户刷新前端会创建多个 Worker 容器，而不是一个用户对应对一个 Worker。

从截图可以看到：

同一个用户 `f``19a6264-cde6-4e2b` **有 11 个 Worker 容器**

**容器启动时间都非常接近（26 分钟**前、48 秒前、47 秒前、37 秒前...）

* 每次刷新前端都会创建新容器

## 问题分析

### 当前逻辑

查看 `wsPTYBridge.ts` 中的 `getUserWorkerInfo` 函数（L117-135）：

```typescript
async function getUserWorkerInfo(userId: string): Promise<{ containerId: string; hostPort: number }> {
  const orchestrator = getContainerOrchestrator()
  let mapping = orchestrator.getUserMapping(userId)

  if (!mapping) {
    console.log(`[PTY Bridge] 用户 ${userId} 未分配容器，自动触发容器调度...`)
    const assignResult = await orchestrator.assignContainerToUser(userId)
    if (!assignResult.success || !assignResult.data) {
      throw new Error(assignResult.error || '容器分配失败，请稍后重试')
    }
    mapping = assignResult.data
    console.log(`[PTY Bridge] 用户 ${userId} 容器分配成功：${mapping.container.containerId}`)
  }

  return {
    containerId: mapping.container.containerName,
    hostPort: mapping.container.hostPort,
  }
}
```

查看 `containerOrchestrator.ts` 中的 `assignContainerToUser` 函数（L352-413）：

```typescript
async assignContainerToUser(userId: string, username?: string, userTier?: UserTier): Promise<OrchestratorResult<UserContainerMapping>> {
  try {
    // 检查用户是否已有容器
    const existingMapping = this.userMappings.get(userId)
    if (existingMapping) {
      // 更新最后活动时间
      existingMapping.lastActivityAt = new Date()
      existingMapping.container.lastActivityAt = new Date()
      console.log(`[ContainerOrchestrator] 用户 ${userId} 已有容器：${existingMapping.container.containerId}`)
      return { success: true, data: existingMapping }
    }
    
    // ... 创建新容器
  }
}
```

### 问题根源

**核心问题：`userMappings`** **是一个内存中的 Map，在以下情况下会丢失：**

1. **Master 服务重启** - 内存数据清空
2. **热重载/开发模式** - 代码重新加载
3. **进程崩溃** - 数据丢失

当 `userMappings` 丢失后：

* `getUserMapping(userId)` 返回 `undefined`

* `getUserWorkerInfo` 认为用户没有容器

* 调用 `assignContainerToUser` 创建新容器

* 但实际上 Docker 中已经存在该用户的容器

### 为什么会发生

从截图日志看到：

```
[PTY Bridge] 创建 PTY 失败：120
error: 容器启动超时（超过 90 秒）
```

**推测场景：**

1. 用户第一次访问 → 创建容器 A（端口 3100）
2. 容器 A 启动慢/超时 → `userMappings` 未成功保存
3. 用户刷新 → `getUserMapping` 返回空 → 创建容器 B（端口 3101）
4. 容器 B 启动慢/超时 → 继续创建容器 C、D、E...

### 健康检查问题

查看容器健康检查逻辑：

```typescript
// 需要检查健康检查是否正确标记容器状态
```

**可能的问题：**

1. 健康检查没有正确更新容器状态
2. 超时容器没有被及时清理
3. `userMappings` 没有在容器创建成功后正确保存

## 解决方案

### 方案 1：持久化用户 - 容器映射（推荐）

**目标：** 将 `userMappings` 持久化到数据库或文件系统

**优点：**

* Master 重启后数据不丢失

* 可以恢复之前的映射关系

* 避免重复创建容器

**实现步骤：**

1. 创建数据库表 `user_worker_mappings`
2. 在 `assignContainerToUser` 成功后写入数据库
3. 在 `getUserMapping` 时先查内存，再查数据库
4. 在 `releaseUserContainer` 时更新数据库
5. 添加定时任务清理过期映射

### 方案 2：从 Docker 恢复映射（快速修复）

**目标：** 从 Docker 容器标签中恢复 `userMappings`

**优点：**

* 实现简单，不需要数据库

* 可以立即解决当前问题

* 作为方案 1 的补充

**实现步骤：**

1. 在创建容器时添加 `userId` 标签
2. 启动时扫描 Docker 容器，恢复 `userMappings`
3. 在 `getUserMapping` 为空时，尝试从 Docker 查找

### 方案 3：添加容器分配锁（防止并发创建）

**目标：** 防止同一用户同时创建多个容器

**实现步骤：**

1. 使用 `Map<userId, Promise>` 记录正在进行的分配
2. 在 `assignContainerToUser` 开始时检查
3. 如果已有进行中的分配，等待其完成

### 方案 4：改进超时处理和重试逻辑

**目标：** 正确处理容器启动超时，避免重复创建

**实现步骤：**

1. 区分"创建失败"和"启动超时"
2. 超时时不立即创建新容器，而是检查已有容器
3. 添加容器健康检查重试机制

## 推荐实施方案

**阶段一：快速修复（方案 2 + 方案 3 + 方案 4）**

1. 添加容器分配锁，防止并发创建
2. 从 Docker 恢复映射，解决当前问题
3. 改进超时处理逻辑

**阶段二：长期方案（方案 1）**

1. 实现数据库持久化
2. 添加数据迁移脚本
3. 完善清理机制

## 具体实施步骤

### 步骤 1：添加容器分配锁

在 `containerOrchestrator.ts` 中：

```typescript
private userAssignmentLocks = new Map<string, Promise<OrchestratorResult<UserContainerMapping>>>()

async assignContainerToUser(userId: string, ...) {
  // 检查是否有进行中的分配
  const existingAssignment = this.userAssignmentLocks.get(userId)
  if (existingAssignment) {
    console.log(`[ContainerOrchestrator] 用户 ${userId} 已有进行中的分配，等待完成...`)
    return existingAssignment
  }

  // 创建新的分配 Promise
  const assignmentPromise = this.doAssignContainerToUser(userId, username, userTier)
  this.userAssignmentLocks.set(userId, assignmentPromise)

  try {
    const result = await assignmentPromise
    return result
  } finally {
    this.userAssignmentLocks.delete(userId)
  }
}

private async doAssignContainerToUser(userId: string, ...) {
  // 原有的 assignContainerToUser 逻辑移到这里
}
```

### 步骤 2：从 Docker 恢复映射

在 `containerOrchestrator.ts` 的 `initialize` 方法中：

```typescript
async initialize(): Promise<void> {
  // ... 现有初始化逻辑

  // 从 Docker 恢复用户映射
  await this.restoreUserMappingsFromDocker()
}

private async restoreUserMappingsFromDocker(): Promise<void> {
  try {
    // 获取所有 claw-web-worker 容器
    const output = execSync(
      'docker ps -a --filter "name=claude-user-" --format "{{.Names}}|{{.ID}}|{{.Ports}}"',
      { encoding: 'utf8' }
    )

    const lines = output.trim().split('\n').filter(Boolean)
    for (const line of lines) {
      const [containerName, containerId, ports] = line.split('|')
      
      // 解析用户名（容器名格式：claude-user-{userId}-{random}）
      const match = containerName.match(/claude-user-([a-f0-9-]+)/)
      if (!match) continue

      const userId = match[1]
      
      // 检查是否已有映射
      if (this.userMappings.has(userId)) {
        console.log(`[ContainerOrchestrator] 用户 ${userId} 已有映射，跳过恢复`)
        continue
      }

      // 解析端口
      const portMatch = ports.match(/0\.0\.0\.0:(\d+)->3000\/tcp/)
      if (!portMatch) continue

      const hostPort = parseInt(portMatch[1], 10)

      // 创建映射
      const mapping: UserContainerMapping = {
        userId,
        container: {
          containerId,
          containerName,
          hostPort,
          status: 'running',
          assignedUserId: userId,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
        assignedAt: new Date(),
        sessionCount: 0,
        lastActivityAt: new Date(),
      }

      this.userMappings.set(userId, mapping)
      console.log(`[ContainerOrchestrator] 从 Docker 恢复用户 ${userId} 的映射：${containerName}`)
    }

    console.log(`[ContainerOrchestrator] 恢复了 ${this.userMappings.size} 个用户映射`)
  } catch (error) {
    console.error('[ContainerOrchestrator] 从 Docker 恢复映射失败:', error)
  }
}
```

### 步骤 3：改进超时处理

在 `wsPTYBridge.ts` 中：

```typescript
async function getUserWorkerInfo(userId: string): Promise<{ containerId: string; hostPort: number }> {
  const orchestrator = getContainerOrchestrator()
  let mapping = orchestrator.getUserMapping(userId)

  if (!mapping) {
    console.log(`[PTY Bridge] 用户 ${userId} 未分配容器，自动触发容器调度...`)
    
    // 先检查 Docker 中是否已有该用户的容器
    const existingContainer = await findUserContainerInDocker(userId)
    if (existingContainer) {
      console.log(`[PTY Bridge] 发现用户 ${userId} 已有 Docker 容器，恢复映射...`)
      // 恢复映射逻辑
    }
    
    const assignResult = await orchestrator.assignContainerToUser(userId)
    if (!assignResult.success || !assignResult.data) {
      throw new Error(assignResult.error || '容器分配失败，请稍后重试')
    }
    mapping = assignResult.data
    console.log(`[PTY Bridge] 用户 ${userId} 容器分配成功：${mapping.container.containerId}`)
  }

  return {
    containerId: mapping.container.containerName,
    hostPort: mapping.container.hostPort,
  }
}

async function findUserContainerInDocker(userId: string): Promise<{ containerId: string; containerName: string; hostPort: number } | null> {
  try {
    const output = execSync(
      `docker ps --filter "name=claude-user-${userId}" --format "{{.Names}}|{{.ID}}|{{.Ports}}"`,
      { encoding: 'utf8' }
    )
    const line = output.trim().split('\n')[0]
    if (!line) return null

    const [containerName, containerId, ports] = line.split('|')
    const portMatch = ports.match(/0\.0\.0\.0:(\d+)->3000\/tcp/)
    if (!portMatch) return null

    return {
      containerId,
      containerName,
      hostPort: parseInt(portMatch[1], 10),
    }
  } catch {
    return null
  }
}
```

### 步骤 4：添加数据库持久化（长期方案）

创建数据库表：

```sql
CREATE TABLE user_worker_mappings (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  container_id VARCHAR(64) NOT NULL,
  container_name VARCHAR(128) NOT NULL,
  host_port INT NOT NULL,
  assigned_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP NOT NULL,
  session_count INT DEFAULT 0,
  status ENUM('active', 'released', 'error') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_container_id (container_id),
  INDEX idx_status (status)
);
```

在 `containerOrchestrator.ts` 中添加数据库操作：

```typescript
// 保存映射到数据库
private async saveUserMappingToDB(mapping: UserContainerMapping): Promise<void> {
  await db.execute(
    `INSERT INTO user_worker_mappings 
     (id, user_id, container_id, container_name, host_port, assigned_at, last_activity_at, session_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE 
     container_id = VALUES(container_id),
     container_name = VALUES(container_name),
     host_port = VALUES(host_port),
     last_activity_at = VALUES(last_activity_at),
     updated_at = CURRENT_TIMESTAMP`,
    [
      generateId(),
      mapping.userId,
      mapping.container.containerId,
      mapping.container.containerName,
      mapping.container.hostPort,
      mapping.assignedAt,
      mapping.lastActivityAt,
      mapping.sessionCount,
    ]
  )
}

// 从数据库加载映射
private async loadUserMappingsFromDB(): Promise<void> {
  const [rows] = await db.execute(
    `SELECT * FROM user_worker_mappings WHERE status = 'active'`
  )
  
  for (const row of rows as any[]) {
    const mapping: UserContainerMapping = {
      userId: row.user_id,
      container: {
        containerId: row.container_id,
        containerName: row.container_name,
        hostPort: row.host_port,
        status: 'running',
        assignedUserId: row.user_id,
        createdAt: new Date(row.created_at),
        lastActivityAt: new Date(row.last_activity_at),
      },
      assignedAt: new Date(row.assigned_at),
      sessionCount: row.session_count,
      lastActivityAt: new Date(row.last_activity_at),
    }
    this.userMappings.set(row.user_id, mapping)
  }
}
```

## 预期效果

修复后：

1. ✅ 一个用户只对应一个 Worker 容器
2. ✅ Master 重启后不会重复创建容器
3. ✅ 容器启动超时不会导致重复创建
4. ✅ 并发请求不会导致重复创建
5. ✅ 可以查看和管理所有用户的容器映射

## 测试计划

1. **单元测试**

   * 测试 `assignContainerToUser` 的并发控制

   * 测试从 Docker 恢复映射

   * 测试数据库持久化

2. **集成测试**

   * 模拟用户多次刷新前端

   * 模拟 Master 重启

   * 模拟容器启动超时

3. **压力测试**

   * 多用户同时访问

   * 大量容器创建/销毁

## 风险与注意事项

1. **数据库迁移风险**

   * 需要回滚方案

   * 先在测试环境验证

2. **性能影响**

   * 数据库查询可能增加延迟

   * 需要添加缓存

3. **向后兼容**

   * 旧容器可能没有 userId 标签

   * 需要兼容处理

## 总结

当前问题的根本原因是 `userMappings` 使用内存存储，在 Master 重启或超时时数据丢失，导致重复创建容器。

建议先实施\*\*方案 2（从 Docker 恢复）+ 方案 3（分配锁）**快速修复问题，然后实施**方案 1（数据库持久化）\*\*作为长期解决方案。
