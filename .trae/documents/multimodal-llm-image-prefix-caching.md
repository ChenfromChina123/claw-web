# 多模态 LLM 接入方案（文字+图片输入 + 前缀缓存）

## 一、研究结论：多模态 LLM 如何同时支持文字+图片输入与前缀缓存

### 1.1 Anthropic Claude 的多模态+缓存机制

**消息格式**：Anthropic 使用 `content` 数组支持多模态，每个元素是一个 `ContentBlock`：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "描述这张图片" },
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } }
  ]
}
```

**前缀缓存机制**：
- **显式缓存**：在内容块上添加 `cache_control: { type: "ephemeral" }`，标记该块之前的所有内容可缓存
- **自动缓存**：在请求顶层添加 `cache_control` 字段，系统自动将缓存断点放在最后一个可缓存块
- **图片可缓存**：图片作为 `messages.content` 中的内容块，**完全支持前缀缓存**
- **缓存匹配规则**：要求 100% 精确匹配，包括文本和图片（base64 数据必须完全一致）
- **最多 4 个缓存断点**，TTL 默认 5 分钟，可设 1 小时

**关键约束**：
- `cache_control` 只能放在消息的**最后一个内容块**上
- 缓存断点之前的内容必须完全一致（包括图片的 base64 数据）
- 最小缓存 token 数：1024 tokens

**多轮对话缓存策略**：
```
请求1: [system] [tools] [user_msg_1] → 缓存 [system + tools + user_msg_1]
请求2: [system] [tools] [user_msg_1] [assistant_1] [user_msg_2] → 命中缓存 + 缓存新前缀
```

### 1.2 OpenAI/Qwen 的多模态+缓存机制

**消息格式**（OpenAI 兼容）：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "描述这张图片" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

**前缀缓存机制**：
- **自动缓存**：OpenAI 自动缓存 ≥1024 tokens 的最长公共前缀，无需手动标记
- **Qwen/DashScope**：也支持 OpenAI 兼容的自动缓存，且 DashScope 支持 `cache_control` 标记
- **图片计入缓存**：图片的 token 也参与前缀匹配和缓存

**Qwen-VL 图片输入方式**：
- Base64 Data URL：`data:image/png;base64,...`
- 公网 URL：`https://example.com/image.png`
- OSS 临时 URL（推荐，稳定性最好）

### 1.3 核心结论

| 提供商 | 图片格式 | 缓存方式 | 图片可缓存 | 缓存标记 |
|--------|----------|----------|-----------|---------|
| Anthropic | `{ type: "image", source: { type: "base64", ... } }` | 显式 `cache_control` | ✅ 是 | `cache_control: { type: "ephemeral" }` |
| OpenAI | `{ type: "image_url", image_url: { url: "data:..." } }` | 自动缓存 | ✅ 是 | 无需标记 |
| Qwen/DashScope | 同 OpenAI 格式 | 自动 + `cache_control` | ✅ 是 | 可选 `cache_control` |

**关键洞察**：图片作为消息内容的一部分参与前缀缓存，只要图片数据（base64）不变，后续请求可以命中缓存。这对多轮对话场景特别有价值——用户发送图片后，后续对话轮次中该图片的 token 可以从缓存读取。

---

## 二、当前项目现状分析

### 2.1 已有的基础设施

| 能力 | 状态 | 位置 |
|------|------|------|
| ContentBlock 支持 image 类型 | ✅ 已有 | `llmService.ts` 第 66 行 |
| Anthropic 格式化支持 image | ✅ 已有 | `llmService.ts` 第 691-700 行 |
| OpenAI 格式化支持 image_url | ✅ 已有 | `llmService.ts` 第 745-753 行 |
| 图片读取+压缩+LLM分析工具 | ✅ 已有 | `imageReadTool.ts` |
| sharp 图片处理库 | ✅ 已有 | `imageReadTool.ts` 中使用 |
| 文件上传接口 | ✅ 已有 | `workspace.routes.ts` POST /api/workspace/:sessionId/upload |
| WorkspaceManager 文件存储 | ✅ 已有 | `workspaceManager.ts` uploads/ 目录 |
| 系统提示静态/动态分割 | ✅ 已有 | `contextBuilder.ts` |
| 前端 ChatInput 文件上传 | ✅ 已有 | `ChatInput.vue`（上传到工作区） |
| Android Coil 图片库 | ✅ 已引入 | `build.gradle.kts`（未使用） |

### 2.2 缺失的部分

| 能力 | 状态 | 影响 |
|------|------|------|
| 用户在聊天中直接发送图片给 LLM | ❌ 缺失 | 核心功能 |
| 消息模型支持图片附件 | ❌ 缺失 | 数据层基础 |
| 前缀缓存 cache_control 标记 | ❌ 缺失 | 性能优化 |
| 图片在消息中的存储格式 | ❌ 缺失 | 持久化 |
| 前端图片粘贴/选择并发送给 LLM | ❌ 缺失 | 用户体验 |
| Android 端图片选择/发送/显示 | ❌ 缺失 | 移动端体验 |
| sessionConversationManager 多模态消息处理 | ❌ 缺失 | 核心流程 |

---

## 三、图片存储方案

### 3.1 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A: Base64 直接存 DB** | 图片 base64 存入 messages.content | 简单，无额外依赖 | DB 膨胀，查询慢，无法 CDN |
| **B: 文件系统 + URL 引用** | 图片存磁盘，DB 存 URL 路径 | DB 轻量，可 CDN | 需文件管理，需静态文件服务 |
| **C: 对象存储 (OSS/S3)** | 图片存云存储，DB 存 URL | 可扩展，CDN 友好 | 成本，依赖外部服务 |

### 3.2 推荐方案：B（文件系统 + URL 引用）

**理由**：
1. 项目已有 `WorkspaceManager` 的 uploads 目录体系
2. Docker 环境中文件系统挂载已成熟
3. 无需引入额外云服务依赖
4. 后续可平滑迁移到 OSS

**存储路径**：`{WORKSPACE_BASE_DIR}/users/{userId}/chat-images/{uuid}.{ext}`

**数据库存储格式**：messages.content 存储 JSON 数组，图片块存储 URL 引用：

```json
[
  { "type": "text", "text": "请分析这张图片" },
  { "type": "image", "source": { "type": "url", "url": "/api/images/{imageId}" } }
]
```

**发送给 LLM 时**：将 URL 引用替换为 base64 数据（从磁盘读取并压缩后）

---

## 四、实施计划

### 阶段 1：后端 - 数据模型与图片存储（约 4 个文件）

#### 1.1 数据库迁移：messages 表支持多模态内容

**文件**：`server/src/master/db/migrations/add_message_image_support.sql`（新建）

- 修改 `messages.content` 列类型从 `TEXT` 改为 `JSON`
- 添加 `attachments` JSON 列存储图片元数据
- 新建 `chat_images` 表存储图片元信息

```sql
ALTER TABLE messages MODIFY COLUMN content JSON;
ALTER TABLE messages ADD COLUMN attachments JSON;

CREATE TABLE IF NOT EXISTS chat_images (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(36),
  message_id VARCHAR(36),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  mime_type VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  width INT,
  height INT,
  storage_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_images_user_id (user_id),
  INDEX idx_chat_images_session_id (session_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 1.2 更新消息类型定义

**文件**：`server/src/master/models/types.ts`

- `Message.content` 类型从 `string | any[]` 更新为支持多模态内容数组的精确定义
- 添加 `ImageContentBlock`、`ImageAttachment` 接口

#### 1.3 更新 MessageRepository

**文件**：`server/src/master/db/repositories/messageRepository.ts`

- `mapToMessage` 方法支持 JSON 列解析
- `createWithId` 方法支持 JSON 格式存储

#### 1.4 图片存储服务

**文件**：`server/src/master/services/imageStorageService.ts`（新建）

- `saveImage(userId, fileBuffer, originalName, mimeType)` → 保存图片到磁盘 + 记录元数据
- `getImage(imageId)` → 读取图片信息
- `getImageBuffer(imageId)` → 读取图片二进制数据
- `processAndCompress(buffer, mimeType)` → 使用 sharp 压缩/调整图片
- `deleteImage(imageId)` → 删除图片
- `resolveImageForLLM(imageBlock)` → 将 URL 引用转为 base64（供 LLM 调用使用）

### 阶段 2：后端 - API 接口与多模态消息处理（约 4 个文件）

#### 2.1 图片上传 API

**文件**：`server/src/master/routes/chat.routes.ts`（修改或新建）

- `POST /api/chat/images/upload` → 上传图片，返回 imageId 和 URL
- `GET /api/chat/images/:imageId` → 获取图片（供前端显示）
- 限制：单张 ≤ 10MB，支持 PNG/JPG/GIF/WebP

#### 2.2 WebSocket 消息协议扩展

**文件**：`server/src/shared/types/index.ts`

- `Attachment` 接口已有，需扩展 `ImageAttachment` 子类型
- WebSocket 事件增加 `image_message` 类型

#### 2.3 SessionConversationManager 多模态支持

**文件**：`server/src/master/services/conversation/sessionConversationManager.ts`

- `handleUserMessage` 方法支持图片附件参数
- 构建消息时将图片 URL 引用转为 base64 ContentBlock
- `callAnthropicWithStream` 添加 `cache_control` 标记
- `callQwenWithStream` 的 `convertToOpenAIMessages` 支持图片块转换

#### 2.4 SessionManager 消息保存

**文件**：`server/src/master/services/sessionManager.ts`

- 保存消息时处理图片附件
- 加载历史消息时解析图片 URL 引用

### 阶段 3：后端 - 前缀缓存实现（约 3 个文件）

#### 3.1 Anthropic cache_control 标记

**文件**：`server/src/master/services/conversation/sessionConversationManager.ts`

在 `callAnthropicWithStream` 中：

```typescript
const streamParams = {
  model,
  max_tokens: 4096,
  system: [
    { type: 'text', text: staticSystemPrompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicSystemPrompt },
  ],
  tools: [...tools],
  messages: messages.map((m, idx) => {
    // 在倒数第二条用户消息的最后一个内容块添加 cache_control
    // 这样多轮对话时历史消息可以被缓存
    const isLastUserMsg = /* 判断逻辑 */
    return {
      role: m.role,
      content: addCacheControlIfNeeded(m.content, isLastUserMsg)
    }
  }),
}
```

**缓存策略**：
1. 系统提示静态部分 → `cache_control: { type: "ephemeral" }`
2. 工具定义 → 自动参与前缀缓存
3. 多轮对话历史 → 在最后一个可缓存块添加 `cache_control`
4. 图片 → 作为消息内容的一部分自动参与缓存

#### 3.2 系统提示分割增强

**文件**：`server/src/master/prompts/contextBuilder.ts`

- `buildCompleteSystemPrompt` 返回结构化对象而非纯字符串
- 区分静态部分（可缓存）和动态部分
- 静态部分添加 `cache_control` 标记

#### 3.3 缓存命中率监控

**文件**：`server/src/master/services/conversation/sessionConversationManager.ts`

- 解析 API 响应中的 `cache_creation_input_tokens` 和 `cache_read_input_tokens`
- 记录缓存命中率日志
- 暴露缓存指标给监控系统

### 阶段 4：Web 前端 - 图片上传与显示（约 4 个文件）

#### 4.1 ChatInput 图片上传功能

**文件**：`web/src/components/ChatInput.vue`

- 添加图片选择按钮（📷）和粘贴支持
- 上传图片到 `/api/chat/images/upload`
- 在输入框上方显示图片预览缩略图
- 发送消息时携带图片附件信息

#### 4.2 消息气泡图片渲染

**文件**：`web/src/components/MessageBubble.vue`（或对应的消息渲染组件）

- 检测消息中的 image 类型内容块
- 渲染图片（使用 `<img>` 标签，src 指向 `/api/chat/images/:imageId`）
- 支持点击放大预览

#### 4.3 前端消息类型扩展

**文件**：`web/src/types/message.ts`

- 添加 `ImageMessage` 或在 `TextMessage` 中支持 `content` 为多模态数组
- 添加 `ImageAttachment` 类型

#### 4.4 WebSocket 消息发送扩展

**文件**：`web/src/composables/useChat.ts`（或对应的聊天 composable）

- `sendMessage` 支持图片附件参数
- WebSocket 发送 `user_message` 事件时携带图片信息

### 阶段 5：Android 端 - 图片选择与显示（约 5 个文件）

#### 5.1 消息模型扩展

**文件**：`chat_application/.../data/api/models/MessageModels.kt`

- `Message` 添加 `attachments: List<Attachment>?` 字段
- 新增 `Attachment` 和 `ImageAttachment` 数据类

#### 5.2 API 接口扩展

**文件**：`chat_application/.../data/api/ApiService.kt`

- 添加 `@Multipart @POST("/api/chat/images/upload")` 上传接口
- 添加 `@GET("/api/chat/images/{imageId}")` 获取图片

#### 5.3 WebSocket 消息发送扩展

**文件**：`chat_application/.../data/websocket/WebSocketManager.kt`

- `sendUserMessage` 支持图片附件参数

#### 5.4 输入栏图片选择

**文件**：`chat_application/.../ui/chat/components/InputBar.kt`

- "+"按钮绑定图片选择器（Photo Picker）
- 显示已选图片缩略图
- 发送时先上传图片再发送消息

#### 5.5 消息气泡图片渲染

**文件**：`chat_application/.../ui/chat/components/EnhancedMessageBubble.kt`

- 使用 Coil 加载并渲染图片
- `MessageComponent` 密封类添加 `ImageComponent` 类型

---

## 五、关键技术细节

### 5.1 图片在 LLM 调用中的处理流程

```
用户上传图片
  → 前端: 选择/粘贴图片 → POST /api/chat/images/upload
  → 后端: sharp 压缩/调整 → 存入 chat-images/ 目录 → 记录 chat_images 表
  → 返回: { imageId, url, width, height }

用户发送消息（含图片）
  → 前端: WebSocket { type: "user_message", content: "描述图片", attachments: [{ imageId, type: "image" }] }
  → 后端: SessionConversationManager.handleUserMessage()
    → 保存消息: content = [{ type: "text", text: "描述图片" }, { type: "image", source: { type: "url", url: "/api/images/xxx" } }]
    → 构建 LLM 请求: resolveImageForLLM() 将 URL → base64
    → Anthropic: [{ type: "text", text: "描述图片" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }]
    → OpenAI: [{ type: "text", text: "描述图片" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }]
  → LLM 响应 → 流式返回 → 前端渲染

历史消息加载
  → DB 读取 content (JSON) → 解析图片 URL 引用 → 前端通过 /api/chat/images/:imageId 加载显示
```

### 5.2 前缀缓存与图片的交互

**核心原则**：图片的 base64 数据参与前缀匹配，只要图片不变，缓存即可命中。

**多轮对话缓存策略**：
```
Turn 1: [system(缓存)] [tools(缓存)] [user: 文本+图片] → 缓存写入
Turn 2: [system(命中)] [tools(命中)] [user: 文本+图片(命中)] [assistant] [user: 新文本] → 部分命中
Turn 3: [system(命中)] [tools(命中)] [user: 文本+图片(命中)] [assistant(命中)] [user: 新文本(命中)] [assistant] [user: 更新文本] → 更多命中
```

**图片缓存注意事项**：
1. 图片必须使用相同的 base64 编码才能命中缓存
2. 每次从磁盘读取图片后应使用相同的压缩参数，确保 base64 一致
3. 建议在首次上传时生成"LLM 就绪"的压缩版本并缓存，避免重复压缩导致 base64 不一致

### 5.3 messages.content 存储格式设计

**数据库存储格式**（JSON 列）：

```json
// 纯文本消息（向后兼容）
"你好，请帮我分析代码"

// 多模态消息
[
  { "type": "text", "text": "请分析这张图片中的代码" },
  { "type": "image", "source": { "type": "url", "url": "/api/chat/images/img-abc123", "media_type": "image/jpeg" } }
]

// 助手消息（含工具调用）
[
  { "type": "text", "text": "我来分析这张图片..." },
  { "type": "tool_use", "id": "tool-123", "name": "image_read", "input": { "path": "/workspace/image.png" } }
]
```

**向后兼容**：读取时判断 content 类型：
- `string` → 纯文本消息（旧格式）
- `Array` → 多模态消息（新格式）

---

## 六、文件变更清单

### 新建文件（5 个）
1. `server/src/master/db/migrations/add_message_image_support.sql` - 数据库迁移
2. `server/src/master/services/imageStorageService.ts` - 图片存储服务
3. `server/src/master/routes/chat.routes.ts` - 聊天图片 API 路由（如不存在则新建）
4. `server/src/master/models/imageTypes.ts` - 图片相关类型定义
5. `server/src/master/db/repositories/imageRepository.ts` - 图片元数据仓库

### 修改文件（约 12 个）
1. `server/src/master/models/types.ts` - 消息类型扩展
2. `server/src/master/db/repositories/messageRepository.ts` - JSON 列支持
3. `server/src/master/db/schema.sql` - Schema 更新
4. `server/src/shared/types/index.ts` - 共享类型扩展
5. `server/src/master/services/conversation/sessionConversationManager.ts` - 多模态+缓存
6. `server/src/master/services/sessionManager.ts` - 图片附件处理
7. `server/src/master/prompts/contextBuilder.ts` - 缓存标记增强
8. `web/src/types/message.ts` - 前端消息类型扩展
9. `web/src/components/ChatInput.vue` - 图片上传 UI
10. `chat_application/.../data/api/models/MessageModels.kt` - Android 消息模型
11. `chat_application/.../data/api/ApiService.kt` - Android API 接口
12. `chat_application/.../ui/chat/components/InputBar.kt` - Android 图片选择

---

## 七、风险与注意事项

1. **数据库迁移风险**：`messages.content` 从 TEXT 改为 JSON 需要迁移现有数据，必须做好备份和回滚方案
2. **图片 base64 大小**：单张图片压缩后仍可能有数百 KB 的 base64，多张图片会显著增加 token 消耗
3. **缓存一致性**：图片的压缩参数必须固定，否则同一图片不同次压缩的 base64 不同，导致缓存失效
4. **安全性**：图片上传需要严格的类型验证和大小限制，防止恶意文件上传
5. **Android 权限**：Android 端需要申请图片读取权限（API 33+ 使用 Photo Picker 无需权限）
6. **性能**：大量图片消息加载时需要懒加载和缩略图，避免前端卡顿
