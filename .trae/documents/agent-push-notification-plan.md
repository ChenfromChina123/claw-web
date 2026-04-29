# Agent 消息主动推送功能实现计划

## 需求概述
在后端添加 agent 消息主动推送功能，agent 可以使用特定的结构进行消息推送，推送给用户隐私信息（账号密码等）。安卓 app 需要显示消息推送功能，具体显示在手机的消息列表（系统通知栏）中。

## 架构分析

### 后端 (claw-web/server)
1. **现有 WebSocket 架构**: Master 服务通过 WebSocket 与前端/移动端通信
2. **通知服务**: 已存在 `notificationService.ts`，支持 WebSocket、邮件、推送(Firebase)、短信通知
3. **Agent 引擎**: `agentEngine.ts` 管理 Agent 生命周期和任务执行
4. **消息路由**: `wsMessageRouter.ts` 处理 WebSocket 消息分发

### 安卓 App (claw-web/chat_application)
1. **WebSocket 管理**: `WebSocketManager.kt` 处理与后端的实时连接
2. **消息模型**: `MessageModels.kt` 定义消息数据结构
3. **无现有推送通知实现**: 需要新增系统通知栏功能

---

## 实现方案

### 阶段一：后端 - Agent 推送消息类型定义

#### 1.1 扩展 Shared Types
**文件**: `server/src/shared/types/index.ts`

添加 Agent 推送消息类型：
```typescript
/**
 * Agent 推送消息类型 - 用于向用户推送隐私信息等
 */
export interface AgentPushMessage {
  id: string
  type: 'agent_push'
  category: 'credential' | 'notification' | 'alert' | 'info'
  title: string
  content: string
  sensitiveData?: {
    username?: string
    password?: string
    token?: string
    apiKey?: string
    [key: string]: string | undefined
  }
  sessionId: string
  timestamp: Date
  expiresAt?: Date
  priority: 'low' | 'normal' | 'high' | 'urgent'
}

/**
 * WebSocket 事件类型扩展
 */
export type WebSocketEventType = 
  | 'message_start' | 'message_delta' | 'message_stop' | 'message_saved'
  | 'tool_use' | 'tool_start' | 'tool_end' | 'tool_error' | 'tool_progress'
  | 'conversation_end' | 'error'
  | 'agent_push'  // 新增
```

#### 1.2 扩展 NotificationService
**文件**: `server/src/master/services/notificationService.ts`

添加 Agent 推送专用方法：
```typescript
/**
 * 发送 Agent 推送消息
 * 用于向用户推送隐私信息、凭证等敏感数据
 */
async sendAgentPush(params: {
  userId: string
  sessionId: string
  category: 'credential' | 'notification' | 'alert' | 'info'
  title: string
  content: string
  sensitiveData?: Record<string, string>
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  expiresInMinutes?: number
}): Promise<string>
```

#### 1.3 添加 WebSocket 消息处理器
**文件**: `server/src/master/websocket/wsMessageRouter.ts`

在 `handleEvent` 中处理 `agent_push` 事件类型，将消息推送给指定用户。

---

### 阶段二：后端 - Agent 推送 API

#### 2.1 创建 Agent Push Service
**新文件**: `server/src/master/services/agentPushService.ts`

```typescript
/**
 * Agent Push Service
 * 
 * 管理 Agent 向用户主动推送消息的逻辑
 * 支持推送类型：
 * - credential: 账号密码等凭证信息
 * - notification: 普通通知
 * - alert: 警告信息
 * - info: 一般信息
 */

export class AgentPushService {
  /**
   * 推送凭证信息给用户
   */
  async pushCredentials(
    userId: string,
    sessionId: string,
    credentials: {
      username: string
      password: string
      service?: string
      note?: string
    }
  ): Promise<string>

  /**
   * 推送一般通知
   */
  async pushNotification(
    userId: string,
    sessionId: string,
    notification: {
      title: string
      content: string
      priority?: 'low' | 'normal' | 'high' | 'urgent'
    }
  ): Promise<string>

  /**
   * 推送警告信息
   */
  async pushAlert(
    userId: string,
    sessionId: string,
    alert: {
      title: string
      content: string
      actionRequired?: boolean
    }
  ): Promise<string>
}
```

#### 2.2 集成到 Agent 引擎
**文件**: `server/src/master/agents/agentEngine.ts`

在 Agent 执行过程中，允许调用推送服务：
```typescript
export interface AgentExecutionContext {
  agentId: string
  task: string
  sessionId: string
  userId: string
  abortSignal?: AbortSignal
  // 新增：推送回调
  onPush?: (message: AgentPushMessage) => void
}
```

#### 2.3 添加 REST API 端点（可选）
**文件**: `server/src/master/server/httpServer.ts`

添加内部 API 供 Agent 调用：
```typescript
// POST /internal/agent/push
// 用于 Worker 或内部服务发送推送消息
```

---

### 阶段三：安卓 App - 系统通知功能

#### 3.1 创建通知管理器
**新文件**: `chat_application/app/src/main/java/com/example/claw_code_application/service/NotificationManager.kt`

```kotlin
/**
 * 系统通知管理器
 * 
 * 负责在 Android 系统通知栏显示 Agent 推送的消息
 * 支持显示隐私信息、账号密码等敏感数据
 */
class NotificationManager @Inject constructor(
    private val context: Context
) {
    /**
     * 显示 Agent 推送通知
     * @param pushMessage 推送消息
     */
    fun showAgentPushNotification(pushMessage: AgentPushMessage)

    /**
     * 显示凭证信息通知（敏感数据）
     * 点击后复制到剪贴板或跳转到安全显示页面
     */
    fun showCredentialNotification(
        title: String,
        username: String,
        password: String,
        service: String?
    )

    /**
     * 创建通知渠道（Android 8.0+ 必需）
     */
    fun createNotificationChannels()
}
```

#### 3.2 定义 Agent 推送消息模型
**新文件**: `chat_application/app/src/main/java/com/example/claw_code_application/data/api/models/AgentPushModels.kt`

```kotlin
@Serializable
data class AgentPushMessage(
    val id: String,
    val type: String = "agent_push",
    val category: PushCategory,
    val title: String,
    val content: String,
    val sensitiveData: SensitiveData? = null,
    val sessionId: String,
    val timestamp: String,
    val expiresAt: String? = null,
    val priority: PushPriority
)

@Serializable
enum class PushCategory {
    CREDENTIAL,    // 凭证信息（账号密码）
    NOTIFICATION,  // 普通通知
    ALERT,         // 警告
    INFO           // 一般信息
}

@Serializable
enum class PushPriority {
    LOW, NORMAL, HIGH, URGENT
}

@Serializable
data class SensitiveData(
    val username: String? = null,
    val password: String? = null,
    val token: String? = null,
    val apiKey: String? = null,
    val extraData: Map<String, String>? = null
)
```

#### 3.3 扩展 WebSocket 事件处理
**文件**: `chat_application/app/src/main/java/com/example/claw_code_application/data/websocket/WebSocketManager.kt`

在 `WebSocketEvent` 密封类中添加：
```kotlin
sealed class WebSocketEvent {
    // ... 现有事件 ...
    
    /**
     * Agent 推送消息事件
     */
    data class AgentPush(
        val message: AgentPushMessage
    ) : WebSocketEvent()
}
```

在 `handleEvent` 中添加 `agent_push` 事件处理：
```kotlin
"agent_push" -> {
    val pushMessage = json.decodeFromJsonElement<AgentPushMessage>(data)
    WebSocketEvent.AgentPush(pushMessage)
}
```

#### 3.4 创建安全显示页面（可选）
**新文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/notification/CredentialDisplayScreen.kt`

用于安全显示敏感信息，支持：
- 模糊显示密码（点击显示）
- 一键复制到剪贴板
- 自动过期提示

---

### 阶段四：集成与测试

#### 4.1 在 ChatViewModel 中处理推送
**文件**: `chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt`

```kotlin
// 监听 AgentPush 事件
viewModelScope.launch {
    webSocketManager.incomingMessages.collect { event ->
        when (event) {
            is WebSocketEvent.AgentPush -> {
                // 显示系统通知
                notificationManager.showAgentPushNotification(event.message)
            }
            // ... 其他事件处理 ...
        }
    }
}
```

#### 4.2 权限配置
**文件**: `chat_application/app/src/main/AndroidManifest.xml`

添加通知权限：
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />
```

#### 4.3 添加通知渠道配置
**文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ClawCodeApplication.kt`

在应用启动时创建通知渠道：
```kotlin
override fun onCreate() {
    super.onCreate()
    // 初始化通知渠道
    NotificationManager(this).createNotificationChannels()
}
```

---

## 数据流图

```
┌─────────────────────────────────────────────────────────────────┐
│                         后端 (Master)                            │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Agent Engine │───▶│ AgentPushSvc │───▶│ NotificationSvc  │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│                                                  │               │
│                                                  ▼               │
│                                         ┌──────────────┐        │
│                                         │ wsMessageRouter      │
│                                         └──────────────┘        │
│                                                  │               │
└──────────────────────────────────────────────────┼───────────────┘
                                                   │ WebSocket
                                                   ▼
┌──────────────────────────────────────────────────┼───────────────┐
│                      安卓 App                     │               │
│                                                  │               │
│  ┌──────────────┐    ┌──────────────┐    ┌───────▼──────┐       │
│  │ WebSocketMgr │───▶│ ChatViewModel│───▶│ Notification │       │
│  └──────────────┘    └──────────────┘    │   Manager    │       │
│                                          └───────┬──────┘       │
│                                                  │               │
│                                                  ▼               │
│                                          ┌──────────────┐        │
│                                          │ 系统通知栏    │        │
│                                          └──────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 文件变更清单

### 后端 (server)
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/shared/types/index.ts` | 修改 | 添加 AgentPushMessage 类型 |
| `src/master/services/agentPushService.ts` | 新增 | Agent 推送服务 |
| `src/master/services/notificationService.ts` | 修改 | 添加 sendAgentPush 方法 |
| `src/master/websocket/wsMessageRouter.ts` | 修改 | 添加 agent_push 事件处理 |
| `src/master/agents/agentEngine.ts` | 修改 | 集成推送回调 |

### 安卓 App (chat_application)
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `data/api/models/AgentPushModels.kt` | 新增 | 推送消息数据模型 |
| `service/NotificationManager.kt` | 新增 | 系统通知管理器 |
| `data/websocket/WebSocketManager.kt` | 修改 | 添加 AgentPush 事件 |
| `viewmodel/ChatViewModel.kt` | 修改 | 处理推送事件 |
| `AndroidManifest.xml` | 修改 | 添加通知权限 |
| `ClawCodeApplication.kt` | 修改 | 初始化通知渠道 |
| `ui/notification/CredentialDisplayScreen.kt` | 新增 | 敏感信息显示页面（可选） |

---

## 安全考虑

1. **敏感数据传输**: WebSocket 使用 wss:// 加密传输
2. **本地存储**: 敏感数据不持久化存储，仅内存中显示
3. **通知隐私**: 敏感信息在通知栏中默认隐藏，点击后进入安全页面查看
4. **自动过期**: 推送消息支持过期时间，过期后无法查看
5. **权限控制**: 仅认证用户能接收对应会话的推送

---

## 后续扩展

1. **推送历史**: 添加推送消息历史记录页面
2. **分类管理**: 支持按类别筛选推送消息
3. **快捷操作**: 通知支持快捷复制、分享等操作
4. **富媒体**: 支持图片、文件等附件推送
