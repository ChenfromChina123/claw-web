# AI消息气泡Markdown渲染优化计划

## 目标
将当前Android端AI消息气泡的Markdown渲染效果优化为图2所示的Web端风格，实现精美的排版、正确的样式层次和嵌入式卡片展示。

## 当前 vs 目标对比

### 当前 Android 实现问题
1. `BeautifulMarkdown` 仅使用默认 `mikepenz Markdown` 组件，无任何样式定制
2. 标题层级不清晰，缺少 emoji 图标
3. inline code 样式简单，背景色和圆角不匹配
4. 列表项无样式区分，label 不突出
5. 段落间距和行高不符合 Manus 设计语言
6. 缺少预览卡片/链接卡片等嵌入组件

### 目标 Web 端风格（图2）
1. **标题**：H1/H2 带 emoji 图标（如 "✅ React error #310 已修复"），层级分明
2. **正文**：清晰段落，合理行高和间距
3. **Inline Code**：灰色背景 `#E8E8ED`，圆角 4-6dp，等宽字体
4. **列表**：有序列表编号 + **加粗 label** + 描述文字
5. **复选框**：✅/❌ 等 emoji 标识
6. **预览卡片**：嵌入式的链接预览/文件卡片（如"文件分享中心"卡片）
7. **链接**：蓝色高亮，可点击

## 技术方案

### 方案选择：定制 mikepenz markdown-renderer 样式
当前项目已使用 `com.mikepenz:multiplatform-markdown-renderer-m3:0.27.0`，该库支持：
- `MarkdownColors` 自定义颜色
- `MarkdownTypography` 自定义字体样式
- `MarkdownImage` 自定义图片渲染
- `CodeBlock` 代码块自定义

我们将充分利用该库的定制能力，无需更换库。

## 实施步骤

### Step 1: 创建自定义 Markdown 样式配置
**文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/MarkdownStyles.kt`

创建以下内容：
- `markdownColors` - 匹配 Manus 配色
  - 文字颜色、链接色（iOS蓝 #007AFF）、代码背景色（#E8E8ED）、代码文字色
- `markdownTypography` - 匹配 Manus 排版
  - H1: 20sp + SemiBold + 下间距
  - H2: 18sp + SemiBold + 下间距
  - H3: 16sp + Medium + 下间距
  - 正文: 15sp + Normal + 行高 1.55
  - 代码: 14sp + Monospace
  - Inline Code: 13sp + Monospace

### Step 2: 创建自定义 CodeBlock 组件
**文件**: `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/CustomCodeBlock.kt`

定制代码块渲染：
- 深色背景（浅色主题 `#F5F5F7`，暗色主题 `#1E1E1E`）
- 圆角 12dp
- 顶部显示语言标签（如 "python"、"javascript"）
- 代码内容等宽字体，行高 1.5
- 横向可滚动

### Step 3: 创建自定义 Inline Code 组件
在 `BeautifulMarkdown.kt` 中添加自定义 `CodeSpan` 处理器：
- 浅灰背景 `#E8E8ED`
- 圆角 4dp
- 等宽字体 13sp
- 内边距 `horizontal=4dp, vertical=2dp`

### Step 4: 优化段落和列表间距
在 `BeautifulMarkdown.kt` 中配置：
- 段落间距 12dp
- 列表项间距 4dp
- 列表缩进 16dp
- 列表 marker（编号/圆点）与内容间距 8dp

### Step 5: 优化标题渲染
在 `BeautifulMarkdown.kt` 中配置：
- H1 底部间距 12dp
- H2 底部间距 8dp
- H3 底部间距 6dp
- 标题与正文间距合理

### Step 6: 支持链接预览卡片（可选增强）
检测内容中的 URL 链接：
- 如果链接是特定格式（如分享链接），渲染为卡片预览
- 卡片包含：域名图标、标题、描述、缩略图
- 复用现有的 `AsyncImage` 组件

### Step 7: 更新 BeautifulMarkdown.kt
整合以上所有定制：
```kotlin
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.fillMaxWidth()
    ) {
        Markdown(
            content = markdown,
            modifier = Modifier.fillMaxWidth(),
            colors = markdownColors,
            typography = markdownTypography,
            codeBlock = { code -> CustomCodeBlock(code) },
            // ... 其他自定义
        )
    }
}
```

### Step 8: 优化 EnhancedMessageBubble.kt 中的气泡样式
- AI 消息气泡背景色调整为 `#F5F5F7`（当前已是）
- 确保 Markdown 内容与气泡内边距协调
- 气泡圆角统一为 18dp

## 验证要点

1. **标题层级**：H1/H2/H3 大小和权重清晰可辨
2. **Inline Code**：背景色、圆角、字体正确显示
3. **代码块**：深色背景、语言标签、可滚动
4. **列表**：编号/圆点对齐，label 加粗
5. **段落间距**：内容不拥挤，层次分明
6. **链接样式**：蓝色高亮，可点击
7. **暗色主题**：所有样式在暗色模式下正常显示
8. **流式输出**：流式输出时样式不闪烁

## 参考资料

### 当前库版本
- `multiplatform-markdown-renderer-m3: 0.27.0`
- `multiplatform-markdown-renderer-code: 0.27.0`

### Web 端参考
- Web 端 Markdown 解析使用 `marked` 库
- 通过 `formatToken` 函数处理各种 token 类型
- 颜色使用 chalk 终端配色
- 标题层级: H1=bold+italic+underline, H2+=bold

### Manus 设计语言
- 行高: 正文 1.55 倍（移动端黄金行高）
- 段落间距: 12-18dp
- 标题: H1=20sp, H2=18sp, H3=16sp
- 代码背景: #E8E8ED (浅色), #1E1E1E (暗色)
