# 安卓 App Agent 流式输出卡顿跳动问题修复计划

## 问题诊断

经过对整个流式输出链路的深入分析，定位到以下 **6 个根因**：

### 根因 1：`updateDisplayMessages()` 全量重建列表（🔴 严重）

**位置**：[ChatViewModel.kt:117-120](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt#L117-L120)

每次 delta 应用后调用 `updateDisplayMessages()`，该方法 **clear + addAll** 整个列表：
```kotlin
internal fun updateDisplayMessages() {
    _displayMessages.clear()          // 触发列表变更通知
    _displayMessages.addAll(_messages.reversed().filter { shouldShowMessage(it) })  // 再次触发
}
```
- 每次 delta 都 O(n) 重建，触发 Compose 全量 recomposition
- **对比 Web 端**：Vue 直接替换数组引用 `messages.value = updatedMessages`，由 Vue 响应式系统批量更新

### 根因 2：`LaunchedEffect(uiState)` 强制 `scrollToItem(0)` — 跳动根源（🔴 严重）

**位置**：[ChatScreen.kt:117-121](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/ChatScreen.kt#L117-L121)

```kotlin
LaunchedEffect(uiState) {
    if (uiState is ChatViewModel.UiState.Success && displayMessages.isNotEmpty()) {
        listState.scrollToItem(0)  // 无动画，立即跳转
    }
}
```
- 流式输出期间 `uiState` 频繁变化（每次 `emitUiStateUpdate()` 都更新）
- 每次变化都触发 `scrollToItem(0)` 无动画跳转
- 与 `animateScrollToItem(0)` 冲突，造成明显的跳动

### 根因 3：Markdown 全量重解析（🔴 严重）

**位置**：[EnhancedMessageBubble.kt:173](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/EnhancedMessageBubble.kt#L173)

```kotlin
val components = remember(content) {
    MessageContentParser.parse(content)
}
```
- `content` 每次变化（delta 追加后），`remember` 的 key 变化，触发重新解析
- `MessageContentParser` 的 LRU 缓存以完整内容为 key，流式时内容不断增长，缓存永远命中不了
- 每次解析都尝试 JSON 解析、正则匹配等，CPU 密集
- 解析后 `BeautifulMarkdown` 使用 `multiplatform-markdown-renderer` 全量重建 Markdown AST

**对比 Web 端**：使用 `markstream-vue` 专为流式设计的 Markdown 渲染器

### 根因 4：防抖机制与全量重建叠加（🟡 中等）

**位置**：[ChatViewModelWsExt.kt:59-75](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModelWsExt.kt#L59-L75)

50ms 防抖本身合理，但防抖结束后立即调用 `updateDisplayMessages()` 全量重建 + Markdown 重解析，导致：
- 每 50ms 一次全量重建（约 20fps），远低于 60fps 流畅标准
- 重建期间 UI 线程被阻塞，造成卡顿感

### 根因 5：`mutableStateListOf` + `copy()` 触发过度重组（🟡 中等）

**位置**：[ChatViewModelWsExt.kt:70](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModelWsExt.kt#L70)

```kotlin
_messages[index] = oldMessage.copy(content = oldMessage.content + deltaToApply)
```
- 每次更新创建新 `Message` 对象
- `_messages` 是 `mutableStateListOf`，索引赋值触发列表变更
- 随后 `updateDisplayMessages()` 又触发 `_displayMessages` 变更
- 双重变更通知 → 双重 recomposition

### 根因 6：缺少流式内容专用渲染路径（🟡 中等）

流式输出时，内容是纯文本逐步追加，但当前走的是完整的 Markdown 解析 + 渲染路径。流式期间大部分内容是普通文本，不需要复杂的 Markdown 解析。

---

## 修复方案

### 步骤 1：优化 `updateDisplayMessages()` — 增量更新

**目标**：避免每次 delta 都全量重建显示列表

**方案**：
- 新增 `updateStreamingMessage(messageId: String, newContent: String)` 方法
- 流式更新时只修改 `_displayMessages` 中对应消息的 content，不重建整个列表
- 仅在消息增删（message_start / message_stop）时才调用全量 `updateDisplayMessages()`

**修改文件**：
- `ChatViewModel.kt`：新增 `updateStreamingMessage()` 方法
- `ChatViewModelWsExt.kt`：`handleMessageDelta()` 改用增量更新

### 步骤 2：修复滚动跳动 — 移除 `LaunchedEffect(uiState)` 的强制滚动

**目标**：消除流式输出期间的跳动

**方案**：
- 移除 `LaunchedEffect(uiState)` 中的 `scrollToItem(0)`
- 改为监听流式消息内容变化，仅在内容高度增长时平滑滚动
- 参考 Web 端的 48ms 节流滚动策略

**修改文件**：
- `ChatScreen.kt`：重构滚动逻辑

### 步骤 3：优化 Markdown 渲染 — 流式内容节流

**目标**：减少流式期间的 Markdown 重解析频率

**方案**：
- 在 `DynamicMessageContent` 中对流式内容使用 `derivedStateOf` 或 `snapshotFlow` 节流
- 流式期间使用更长的防抖间隔（如 150-200ms），减少重解析次数
- 流式结束后立即用最终内容做一次完整渲染
- 流式期间对纯文本内容跳过 Markdown 解析，直接用 `Text` 组件渲染

**修改文件**：
- `EnhancedMessageBubble.kt`：`DynamicMessageContent()` 添加流式节流逻辑

### 步骤 4：优化防抖策略

**目标**：平衡流畅度和性能

**方案**：
- 将 `debounceIntervalMs` 从 50ms 调整为 30ms（更频繁的小批量更新）
- 但配合步骤 3 的渲染节流，UI 更新频率控制在 150-200ms
- 分离数据层防抖和渲染层节流

**修改文件**：
- `ChatViewModel.kt`：调整防抖参数
- `ChatViewModelWsExt.kt`：调整 delta 应用策略

### 步骤 5：添加流式光标动画

**目标**：提升视觉反馈，让用户感知到内容正在生成

**方案**：
- 在流式消息末尾添加闪烁光标 `▋`
- 使用 `AnimatedVisibility` + `InfiniteTransition` 实现闪烁效果

**修改文件**：
- `EnhancedMessageBubble.kt`：在 `DynamicMessageContent` 中添加光标

---

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `ChatViewModel.kt` | 新增 `updateStreamingMessage()`，调整防抖参数 |
| `ChatViewModelWsExt.kt` | `handleMessageDelta()` 改用增量更新 |
| `ChatScreen.kt` | 重构滚动逻辑，移除跳动源 |
| `EnhancedMessageBubble.kt` | 流式渲染节流 + 光标动画 |

## 预期效果

- 流式输出从 ~20fps 提升到接近 60fps
- 消除跳动，滚动平滑
- Markdown 渲染不再阻塞 UI 线程
- 视觉上有打字光标反馈
