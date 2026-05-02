# AI流式输出流畅度优化计划

## 问题诊断

### 抖动现象的根本原因分析

经过全面代码审查，发现以下**5个关键问题**导致流式输出时页面抖动：

#### 1. **防抖机制设计缺陷**（最严重）
**文件**: `EnhancedMessageBubble.kt` 第189-219行

```kotlin
// 问题代码
@Composable
private fun StreamingTextContent(content: String) {
    var renderedContent by remember { mutableStateOf(content) }
    var lastUpdateTime by remember { mutableStateOf(0L) }

    val currentTime = System.currentTimeMillis()
    if (content != renderedContent && currentTime - lastUpdateTime >= 80) {
        renderedContent = content  // 在Composable执行期间直接修改状态！
        lastUpdateTime = currentTime
    }
    // ...
}
```

**问题**: 
- 在Composable函数执行期间直接修改`renderedContent`状态，违反Compose原则
- 每次重组时检查时间并可能修改状态，导致无限重组循环
- 80ms防抖间隔过短，对于复杂Markdown渲染仍然过于频繁

#### 2. **滚动动画与内容更新冲突**
**文件**: `ChatScreen.kt` 第124-136行

```kotlin
// 问题代码
LaunchedEffect(streamingMessage?.content?.length) {
    if (streamingMessage != null && canAutoScroll) {
        val currentLength = streamingMessage.content.length
        if (currentLength - lastScrollLength >= 300 || lastScrollLength == 0) {
            lastScrollLength = currentLength
            listState.animateScrollToItem(0)  // 动画滚动与内容更新同时进行
        }
    }
}
```

**问题**:
- `animateScrollToItem`是动画操作，与内容更新同时进行时产生视觉抖动
- 每300字符触发一次滚动，频率过高
- 没有考虑内容高度变化，只考虑字符数

#### 3. **Markdown解析器频繁重计算**
**文件**: `BeautifulMarkdown.kt` 第36-178行

```kotlin
// 问题：每次重组都重新创建所有样式对象
val markdownColors = markdownColor(...)
val markdownTypography = markdownTypography(...)
val tableComponents = MarkdownTable.createComponents()
val components = markdownComponents(...)
```

**问题**:
- 所有样式对象在每次重组时重新创建
- `MarkdownTable.createComponents()`开销大
- 没有使用`remember`缓存计算结果

#### 4. **消息列表更新策略低效**
**文件**: `ChatViewModel.kt` 第122-130行

```kotlin
// 问题代码
internal fun updateStreamingMessage(messageId: String) {
    val message = _messages.find { it.id == messageId } ?: return
    if (!shouldShowMessage(message)) return
    val displayIndex = _displayMessages.indexOfFirst { it.id == messageId }
    if (displayIndex != -1) {
        _displayMessages[displayIndex] = message  // 直接修改列表项触发全列表重组
    }
}
```

**问题**:
- 直接修改`_displayMessages`列表中的项
- 导致LazyColumn中所有可见项重新测量和重组
- 没有使用`SnapshotStateList`的批量更新能力

#### 5. **工具调用更新过于频繁**
**文件**: `ChatViewModelWsExt.kt` 第205-220行

```kotlin
// 问题：工具进度每次更新都触发UI刷新
private fun ChatViewModel.handleToolProgress(event: WebSocketManager.WebSocketEvent.ToolProgress) {
    // ...
    scheduleToolUpdate(event.id, oldTool.copy(...))  // 100ms防抖仍然太频繁
}
```

**问题**:
- 工具调用进度更新100ms防抖间隔太短
- 工具调用卡片展开/折叠状态变化时动画与流式输出冲突

---

## 优化方案

### 阶段一：修复防抖机制（核心修复）

**目标**: 消除重组循环，实现真正的防抖

**修改文件**: `EnhancedMessageBubble.kt`

```kotlin
/**
 * 流式文本内容渲染 - 优化版
 * 使用LaunchedEffect + delay实现真正的防抖，避免重组循环
 */
@Composable
private fun StreamingTextContent(content: String) {
    // 使用remember缓存显示内容，避免不必要的重组
    var displayedContent by remember { mutableStateOf(content) }
    
    // 使用LaunchedEffect监听内容变化，在协程中处理防抖逻辑
    LaunchedEffect(content) {
        // 只有内容增长超过阈值或首次加载时才更新
        val shouldUpdate = displayedContent.isEmpty() || 
                          content.length - displayedContent.length >= 50 ||
                          content.length < displayedContent.length // 内容被重置
        
        if (shouldUpdate) {
            // 添加短暂延迟，批量处理快速到达的字符
            delay(32) // ~30fps，平衡流畅度和性能
            displayedContent = content
        }
    }
    
    // 使用derivedStateOf缓存截断后的内容，避免重复计算
    val displayContent by remember(displayedContent) {
        derivedStateOf {
            if (displayedContent.length > 5000) {
                displayedContent.take(5000) + "\n... (内容过长，已截断)"
            } else {
                displayedContent
            }
        }
    }

    if (displayContent.isNotBlank()) {
        BeautifulMarkdown(
            markdown = displayContent,
            isStreaming = true
        )
    }
}
```

### 阶段二：优化滚动策略

**目标**: 消除滚动动画与内容更新的冲突

**修改文件**: `ChatScreen.kt`

```kotlin
// 替换原有的滚动逻辑
// 流式内容增长时：智能滚动跟随 - 优化版
val streamingMessage = displayMessages.firstOrNull { it.isStreaming }
var lastScrollHeight by remember { mutableStateOf(0) }

LaunchedEffect(streamingMessage?.content?.length) {
    if (streamingMessage != null && canAutoScroll) {
        val currentLength = streamingMessage.content.length
        // 改为基于内容长度而非字符数，减少滚动频率
        if (currentLength - lastScrollLength >= 800 || lastScrollLength == 0) {
            lastScrollLength = currentLength
            // 使用scrollToItem而非animateScrollToItem，避免动画冲突
            listState.scrollToItem(0)
        }
    }
}
```

### 阶段三：优化Markdown渲染性能

**目标**: 减少重复计算，缓存样式对象

**修改文件**: `BeautifulMarkdown.kt`

```kotlin
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current

    // 使用remember缓存样式对象，避免每次重组重新创建
    val markdownColors = remember(colors) {
        markdownColor(
            text = colors.TextPrimary,
            codeText = colors.PrimaryLight,
            codeBackground = colors.CodeBackground,
            inlineCodeText = colors.PrimaryLight,
            inlineCodeBackground = colors.SurfaceVariant,
            dividerColor = colors.Border,
            linkText = colors.PrimaryLight
        )
    }

    val markdownTypography = remember(colors) {
        markdownTypography(
            h1 = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, 
                          lineHeight = 28.sp, color = colors.TextPrimary),
            // ... 其他样式
        )
    }

    // 缓存table组件
    val tableComponents = remember { MarkdownTable.createComponents() }
    
    val components = remember(tableComponents) {
        markdownComponents(
            codeBlock = highlightedCodeBlock,
            codeFence = highlightedCodeFence,
            table = tableComponents.table
        )
    }
    
    // ... 其余代码
}
```

### 阶段四：优化消息列表更新

**目标**: 减少列表重组范围

**修改文件**: `ChatViewModel.kt`

```kotlin
/**
 * 流式增量更新：仅更新指定消息，避免全量重建列表 - 优化版
 * 使用copy-on-write策略，触发精准重组
 */
internal fun updateStreamingMessage(messageId: String) {
    val message = _messages.find { it.id == messageId } ?: return
    if (!shouldShowMessage(message)) return
    
    val displayIndex = _displayMessages.indexOfFirst { it.id == messageId }
    if (displayIndex != -1) {
        // 创建新列表实例，触发Compose的精准重组
        val newList = _displayMessages.toMutableList()
        newList[displayIndex] = message
        _displayMessages.clear()
        _displayMessages.addAll(newList)
    }
}
```

### 阶段五：优化工具调用更新频率

**目标**: 减少工具调用更新对UI的干扰

**修改文件**: `ChatViewModel.kt`

```kotlin
// 增加防抖间隔
internal val toolUpdateDebounceIntervalMs = 300L // 从100ms增加到300ms
```

---

## 实施步骤

### Step 1: 修复防抖机制（优先级：P0）
- [ ] 修改 `EnhancedMessageBubble.kt` 中的 `StreamingTextContent` 函数
- [ ] 使用 `LaunchedEffect` + `delay` 实现真正的防抖
- [ ] 使用 `derivedStateOf` 缓存截断内容

### Step 2: 优化滚动策略（优先级：P0）
- [ ] 修改 `ChatScreen.kt` 中的滚动逻辑
- [ ] 将 `animateScrollToItem` 改为 `scrollToItem`
- [ ] 增加滚动触发阈值从300到800字符

### Step 3: 优化Markdown渲染（优先级：P1）
- [ ] 修改 `BeautifulMarkdown.kt`
- [ ] 使用 `remember` 缓存所有样式对象
- [ ] 缓存 `MarkdownTable.createComponents()` 结果

### Step 4: 优化列表更新（优先级：P1）
- [ ] 修改 `ChatViewModel.kt` 中的 `updateStreamingMessage`
- [ ] 使用 copy-on-write 策略更新列表

### Step 5: 调整工具调用频率（优先级：P2）
- [ ] 修改防抖间隔从100ms到300ms

### Step 6: 测试验证
- [ ] 长文本流式输出测试
- [ ] 代码块流式输出测试
- [ ] 混合内容（文本+工具调用）测试
- [ ] 快速输入场景测试

---

## 预期效果

1. **消除页面抖动**: 通过修复防抖机制，消除重组循环
2. **提升流畅度**: 减少不必要的重绘和布局计算
3. **降低CPU占用**: 减少Markdown解析和样式计算频率
4. **改善用户体验**: 流式输出如丝般顺滑

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 防抖延迟导致感知卡顿 | 低 | 中 | 使用32ms延迟，保持30fps |
| 滚动不及时 | 低 | 低 | 保留手动滚动能力 |
| Markdown缓存导致主题切换问题 | 低 | 低 | remember包含colors依赖 |

---

## 代码变更统计

- **修改文件数**: 4个
- **预计新增代码**: ~50行
- **预计修改代码**: ~80行
- **预计删除代码**: ~30行
