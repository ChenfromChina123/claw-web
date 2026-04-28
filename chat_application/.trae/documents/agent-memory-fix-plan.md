# Agent 无记忆问题诊断与修复计划

## 问题现象
用户反馈给Agent发送消息时，Agent没有记忆/上下文，每次都像是在重新开始对话（如截图所示）。

---

## 🔍 根因分析

### 1. 核心发现：后端通过 sessionId 管理记忆

根据 **[后端API文档](doc/后端API详细文档.md)** 分析：

| API | 参数 | 说明 |
|-----|------|------|
| `POST /api/agents/execute` | sessionId, task, prompt | 通过sessionId获取历史 |
| WS `user_message` | sessionId, content | 通过sessionId获取历史 |

**后端设计意图**：前端只需传递正确的 `sessionId`，后端会自动从数据库加载该会话的历史消息作为上下文。前端**不需要**手动传递历史消息数组。

### 2. 问题定位：前端 sessionId 管理缺陷

查看 [ChatViewModel.kt:562-575](app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt#L562-L575) 的 `ensureSession()` 方法：

```kotlin
private suspend fun ensureSession(): Session? {
    return currentSessionId?.let { id ->
        Session(id = id, title = "", createdAt = "", updatedAt = "")
    } ?: run {
        // ⚠️ 如果 currentSessionId 为 null，每次都创建新会话！
        val result = chatRepository.createSession()
        result.fold(
            onSuccess = { session ->
                currentSessionId = session.id
                session
            },
            onFailure = { null }
        )
    }
}
```

**问题链路**：
1. 用户进入聊天界面 → `currentSessionId = null`
2. 用户发送第一条消息 → `ensureSession()` 创建新会话 A，设置 `currentSessionId = A`
3. 用户发送第二条消息 → 使用会话 A ✅ 有记忆
4. **用户退出聊天界面再进入** → ViewModel重建，`currentSessionId = null`
5. 用户发送消息 → `ensureSession()` 创建**新会话 B** ❌ **失去记忆！**

### 3. 会话加载逻辑存在但未被正确调用

[ChatViewModel.kt:392-425](app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt#L392-L425) 有 `loadSession(sessionId)` 方法可以加载历史会话：

```kotlin
fun loadSession(sessionId: String) {
    // 加载会话详情（含历史消息）
    val result = chatRepository.getSessionDetail(sessionId)
    _messages.addAll(detail.messages)
    currentSessionId = sessionId
}
```

但此方法**只在用户主动点击历史会话时调用**，新对话场景下不会调用。

---

## 📋 修复方案

### 方案概述
确保在聊天界面初始化时，正确恢复或复用已有会话，避免不必要的会话创建。

### 具体步骤

#### 步骤 1: 检查聊天界面的初始化流程
- 查找 ChatScreen 或相关入口组件
- 确认进入聊天时如何初始化 ChatViewModel
- 检查是否有传入 sessionId 的逻辑

#### 步骤 2: 修改 ensureSession() 逻辑（核心修复）
优化会话复用策略：
- 优先使用已有的 currentSessionId
- 如果为空，检查是否有"空会话"可复用（参考后端文档4.2节的说明："如果用户有空会话（无消息），系统会自动复用该会话而非创建新的"）
- 避免每次进入都创建新会话

#### 步骤 3: 添加会话持久化/恢复机制
选项A（推荐）：在聊天入口处检查并恢复未完成的会话
- 进入聊天时，查询最近的活跃会话
- 如果有未结束的会话，自动 loadSession()

选项B：使用 DataStore/SharedPreferences 持久化当前会话ID
- 应用启动时读取上次使用的 sessionId
- 验证会话有效性后恢复

#### 步骤 4: 验证 WebSocket 消息格式
确认 [WebSocketManager.sendUserMessage()](app/src/main/java/com/example/claw_code_application/data/websocket/WebSocketManager.kt#L154-L180) 发送的消息格式符合后端期望：
```json
{
  "type": "user_message",
  "sessionId": "xxx",
  "content": "用户消息"
}
```

#### 步骤 5: 测试验证
- 发送多条消息，验证Agent有上下文记忆
- 退出重进后继续对话，验证记忆保持
- 切换会话后再切回，验证独立会话记忆正确

---

## 📝 涉及文件

| 文件 | 修改内容 |
|------|----------|
| [ChatViewModel.kt](app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt) | 修改 ensureSession() 和初始化逻辑 |
| [ChatScreen.kt](app/src/main/java/com/example/claw_code_application/ui/chat/ChatScreen.kt) | 可能需要调整初始化参数传递 |
| [ChatRepository.kt](app/src/main/java/com/example/claw_code_application/data/repository/ChatRepository.kt) | 可能需要添加"获取最近活跃会话"方法 |

---

## ⚠️ 注意事项
1. 后端 API 已支持通过 sessionId 获取历史，无需修改后端
2. 修复重点在前端的会话生命周期管理
3. 需要考虑多设备/多登录场景下的会话同步
