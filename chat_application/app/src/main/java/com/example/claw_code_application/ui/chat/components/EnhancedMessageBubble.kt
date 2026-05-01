package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.ui.theme.BubbleColor
import java.text.SimpleDateFormat
import java.util.*

/**
 * 增强版消息气泡组件 - Manus 1.6 Lite 风格
 * 
 * 设计理念：
 * - 轻、透、统一，没有多余的装饰
 * - AI消息：浅灰背景(#F5F5F7)，极淡阴影，圆角18dp
 * - 用户消息：纯黑背景，白色文字，圆角20dp
 * - 最大宽度：屏幕的85%，避免单行文字过长
 */
@Composable
fun EnhancedMessageBubble(
    message: Message,
    toolCalls: List<ToolCall> = emptyList(),
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    val bubbleColors = BubbleColor.current
    val isUser = message.role == "user"

    // Manus 1.6 Lite 气泡配置
    val bubbleShape = RoundedCornerShape(
        topStart = if (isUser) 20.dp else 12.dp,
        topEnd = if (isUser) 4.dp else 18.dp,
        bottomStart = 18.dp,
        bottomEnd = 18.dp
    )

    // AI消息使用极淡阴影
    val bubbleElevation = if (isUser) Modifier else Modifier.shadow(
        elevation = 2.dp,
        shape = bubbleShape,
        ambientColor = androidx.compose.ui.graphics.Color(0x0F000000),
        spotColor = androidx.compose.ui.graphics.Color(0x0F000000)
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
            modifier = Modifier.fillMaxWidth(if (isUser) 0.85f else 0.95f)
        ) {
            // 用户消息显示气泡，AI消息不显示气泡（只显示工具调用）
            if (isUser) {
                // 消息内容卡片 - Manus 1.6 Lite 风格
                Surface(
                    modifier = bubbleElevation,
                    shape = bubbleShape,
                    color = bubbleColors.background,
                    shadowElevation = 0.dp,
                    border = null
                ) {
                    Column(
                        modifier = Modifier.padding(
                            horizontal = 16.dp,
                            vertical = 12.dp
                        )
                    ) {
                        val filteredContent = remember(message.content) {
                            getSafeAssistantContent(message.content)
                        }

                        if (filteredContent.isNotBlank()) {
                            Text(
                                text = filteredContent,
                                color = bubbleColors.textColor,
                                style = TextStyle(
                                    fontSize = 15.sp,
                                    lineHeight = 23.sp
                                )
                            )
                        }
                    }
                }
            } else {
                // AI消息：不显示气泡，直接渲染内容（如果有非工具内容）
                val hasNonToolContent = remember(message.content) {
                    val trimmed = message.content.trim()
                    // 检查内容是否只包含工具调用，不包含普通文本
                    !(trimmed.startsWith("[") &&
                      (trimmed.contains("\"type\":\"tool_use\"") ||
                       trimmed.contains("\"type\":\"tool_result\"")))
                }

                if (hasNonToolContent) {
                    DynamicMessageContent(
                        content = message.content,
                        isStreaming = message.isStreaming
                    )
                }
            }

            // 工具调用显示 - 统一使用 ToolCallCard 显示（紧凑模式）
            if (toolCalls.isNotEmpty() && !isUser) {
                if (!isUser) {
                    Spacer(modifier = Modifier.height(8.dp))
                }
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    toolCalls.forEachIndexed { index, toolCall ->
                        key(toolCall.id) {
                            var expanded by remember { mutableStateOf(false) }
                            CompactToolCallCard(
                                toolCall = toolCall,
                                expanded = expanded,
                                onExpandedChange = { expanded = it }
                            )
                        }
                    }
                }
            }

            // 时间戳 - Manus风格：简洁灰色
            Text(
                text = formatTimestamp(message.timestamp),
                color = AppColor.TextSecondary,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp)
            )
        }
    }
}

/**
 * 动态消息内容渲染 - Manus 1.6 Lite 风格
 * 根据内容类型渲染不同组件
 * 
 * Manus 风格特点：
 * - 标题：H1 20sp加粗，H2 18sp加粗，H3 16sp加粗
 * - 文本：行高1.55倍，段落间距18sp
 * - 代码/关键词：浅灰背景(#E8E8ED)，圆角6dp
 * - 链接：iOS系统蓝(#007AFF)，无下划线
 */
@Composable
private fun DynamicMessageContent(
    content: String,
    isStreaming: Boolean
) {
    val components = remember(content) {
        MessageContentParser.parse(content)
    }

    components.forEach { component ->
        when (component) {
            is MessageComponent.Text -> {
                val displayContent = remember(component.content) {
                    if (component.content.length > 5000) {
                        component.content.take(5000) + "\n... (内容过长，已截断)"
                    } else {
                        component.content
                    }
                }

                // 使用超美Markdown渲染组件（Material3 + 代码高亮）
                BeautifulMarkdown(
                    markdown = displayContent,
                    isStreaming = isStreaming
                )
            }

            is MessageComponent.ToolUse -> {
                // 工具调用现在统一通过 ToolCallCard 显示
                // 不在消息内容中渲染，避免与 ToolCallCard 重复
                // 保留此分支以防止解析错误，但不渲染任何内容
            }

            is MessageComponent.ToolResult -> {
                // 工具结果现在统一通过 ToolCallCard 显示
                // 不在消息内容中渲染，避免与 ToolCallCard 重复
                // 保留此分支以防止解析错误，但不渲染任何内容
            }

            is MessageComponent.FileListResult -> {
                FileListViewer(
                    path = component.path,
                    count = component.count,
                    files = component.files
                )
            }

            is MessageComponent.SearchResult -> {
                SearchResultViewer(
                    summary = component.summary,
                    matchCount = component.matchCount,
                    matchedFiles = component.matchedFiles
                )
            }

            is MessageComponent.FileContentResult -> {
                FileContentViewer(
                    path = component.path,
                    content = component.content,
                    lineCount = component.lineCount
                )
            }

            is MessageComponent.ErrorResult -> {
                ErrorResultViewer(
                    error = component.error,
                    errorType = component.errorType
                )
            }

            is MessageComponent.StepProgress -> {
                var expanded by remember { mutableStateOf(true) }
                StepProgress(
                    title = component.title,
                    currentStep = component.currentStep,
                    totalSteps = component.totalSteps,
                    steps = component.steps,
                    isExpanded = expanded,
                    onExpandedChange = { expanded = it }
                )
            }

            is MessageComponent.CodeDiff -> {
                CodeDiffEditor(
                    fileName = component.fileName,
                    originalCode = component.originalCode,
                    modifiedCode = component.modifiedCode,
                    language = component.language
                )
            }

            is MessageComponent.Image -> {
                AsyncImage(
                    model = component.imageUrl,
                    contentDescription = component.originalName ?: "图片",
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 200.dp)
                        .padding(vertical = 4.dp),
                    contentScale = ContentScale.Fit
                )
            }
        }

        // 组件之间添加间距 - Manus标准：16dp
        if (component !== components.lastOrNull()) {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

/**
 * 工具调用组件 - Manus 1.6 Lite 风格
 * 显示为简洁的终端卡片
 */
@Composable
private fun ToolUseComponent(
    toolUse: MessageComponent.ToolUse,
    isExecuting: Boolean
) {
    val command = (toolUse.input["command"] ?: toolUse.input["cmd"] ?: "").toString()

    if (command.isNotBlank()) {
        TerminalViewer(
            command = command,
            stdout = "",
            stderr = "",
            exitCode = 0,
            isExecuting = isExecuting
        )
    } else {
        // 显示为通用工具卡片 - Manus风格
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = Color(0xFFF5F5F7),
            border = BorderStroke(1.dp, Color(0xFFE8E8ED))
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // 简洁的工具图标
                Text(text = "⚡", fontSize = 14.sp)
                Text(
                    text = if (isExecuting) "正在执行: ${toolUse.toolName}" else toolUse.toolName,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = AppColor.TextPrimary
                )
            }
        }
    }
}

/**
 * 文件列表查看器组件 - Manus 1.6 Lite 风格
 * 显示文件/目录列表
 */
@Composable
private fun FileListViewer(
    path: String,
    count: Int,
    files: List<FileInfo>,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = colors.SurfaceVariant,
        border = BorderStroke(1.dp, colors.Border)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            // 路径标题
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "📁", fontSize = 14.sp)
                Text(
                    text = path,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.TextPrimary
                )
                Text(
                    text = "($count 项)",
                    fontSize = 11.sp,
                    color = colors.TextSecondary
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = colors.Border, thickness = 1.dp)
            Spacer(modifier = Modifier.height(12.dp))

            // 文件列表
            files.forEach { file ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // 文件图标
                    Text(
                        text = if (file.isDirectory) "📂" else "📄",
                        fontSize = 14.sp
                    )

                    // 文件名
                    Text(
                        text = file.name,
                        fontSize = 13.sp,
                        color = if (file.isDirectory) AppColor.PrimaryLight else AppColor.TextPrimary,
                        fontWeight = if (file.isDirectory) FontWeight.Medium else FontWeight.Normal,
                        modifier = Modifier.weight(1f)
                    )

                    // 类型标签 - 浅灰背景
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = if (file.isDirectory) 
                            AppColor.PrimaryLight.copy(alpha = 0.1f) 
                        else 
                            AppColor.TextSecondary.copy(alpha = 0.1f)
                    ) {
                        Text(
                            text = if (file.isDirectory) "目录" else "文件",
                            fontSize = 11.sp,
                            color = if (file.isDirectory) AppColor.PrimaryLight else AppColor.TextSecondary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }
            }
        }
    }
}

/**
 * 搜索结果查看器组件 - Manus 1.6 Lite 风格
 */
@Composable
private fun SearchResultViewer(
    summary: String,
    matchCount: Int,
    matchedFiles: List<String>,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = colors.SurfaceVariant,
        border = BorderStroke(1.dp, colors.Border)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "🔍", fontSize = 14.sp)
                Text(
                    text = summary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.TextPrimary
                )
            }

            if (matchedFiles.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                HorizontalDivider(color = colors.Border, thickness = 1.dp)
                Spacer(modifier = Modifier.height(12.dp))

                matchedFiles.take(10).forEach { filePath ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(text = "📄", fontSize = 12.sp)
                        Text(
                            text = filePath,
                            fontSize = 12.sp,
                            color = colors.TextSecondary,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                if (matchedFiles.size > 10) {
                    Text(
                        text = "...还有 ${matchedFiles.size - 10} 个文件",
                        fontSize = 11.sp,
                        color = colors.TextSecondary,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        }
    }
}

/**
 * 文件内容读取结果查看器组件 - Manus 1.6 Lite 风格
 */
@Composable
private fun FileContentViewer(
    path: String,
    content: String,
    lineCount: Int,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = colors.SurfaceVariant,
        border = BorderStroke(1.dp, colors.Border)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "📄", fontSize = 14.sp)
                if (path.isNotEmpty()) {
                    Text(
                        text = path,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = colors.PrimaryLight
                    )
                }
                Text(
                    text = "($lineCount 行)",
                    fontSize = 11.sp,
                    color = colors.TextSecondary
                )
            }

            if (content.isNotBlank()) {
                Spacer(modifier = Modifier.height(12.dp))
                HorizontalDivider(color = colors.Border, thickness = 1.dp)
                Spacer(modifier = Modifier.height(12.dp))

                val displayContent = if (content.length > 500) {
                    content.take(500) + "\n... (已截断)"
                } else {
                    content
                }

                Text(
                    text = displayContent,
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    color = colors.TextPrimary,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

/**
 * 错误结果查看器组件 - Manus 1.6 Lite 风格
 * 错误提示：浅红背景 + 深红文字
 */
@Composable
private fun ErrorResultViewer(
    error: String,
    errorType: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        // 浅红背景
        color = AppColor.ErrorBackground,
        border = BorderStroke(1.dp, AppColor.Error.copy(alpha = 0.3f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "❌", fontSize = 14.sp)
                Text(
                    text = "错误: $errorType",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = AppColor.ErrorText
                )
            }

            if (error.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = error,
                    fontSize = 12.sp,
                    color = AppColor.ErrorText.copy(alpha = 0.9f),
                    fontFamily = FontFamily.Monospace,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

/**
 * 过滤用户消息中的 tool_result/tool_use JSON 内容（与Web端三重过滤对齐）
 * Anthropic API 会将工具结果包装成 user 角色消息，需要过滤掉这些内部数据
 *
 * 支持检测的格式（与Web端 getMessageText + getSafeAssistantContent 对齐）：
 * - 对象格式: {"type":"tool_result", ...}
 * - 数组格式: [{"type":"tool_result", ...}, ...]
 * - 包含 tool_use_id 的对象/数组
 *
 * @param content 原始消息内容
 * @return 过滤后的内容，如果是 tool_result/tool_use 则返回空字符串
 */
fun filterToolResultContent(content: String): String {
    if (content.isBlank()) return ""

    val trimmed = content.trim()

    val isToolJson = when {
        trimmed.startsWith("[") -> {
            trimmed.contains("\"type\"") &&
            (trimmed.contains("tool_result") || trimmed.contains("tool_use")) ||
            trimmed.contains("tool_use_id")
        }
        trimmed.startsWith("{") -> {
            trimmed.contains("\"type\"") &&
            (trimmed.contains("tool_result") || trimmed.contains("tool_use")) ||
            trimmed.contains("tool_use_id")
        }
        else -> false
    }

    return if (isToolJson) {
        ""
    } else {
        content
    }
}

/**
 * 判断消息是否应该显示（与Web端 shouldShowMessage 对齐）
 * 过滤掉 tool_result 类型的用户消息（内部消息，不显示给用户）
 *
 * @param message 消息对象
 * @return true 表示应该显示，false 表示应该隐藏
 */
fun shouldShowMessage(message: Message): Boolean {
    if (message.role == "user") {
        val content = message.content.trim()

        // 情况1：content 是 JSON 数组格式（标准 Anthropic 格式）
        if (content.startsWith("[") && content.endsWith("]")) {
            val hasToolResult = content.contains("\"type\"") &&
                (content.contains("tool_result") || content.contains("tool_use"))
            if (hasToolResult) {
                return false
            }
        }

        // 情况2：content 是 JSON 对象格式
        if (content.startsWith("{") && content.endsWith("}")) {
            val hasToolResult = content.contains("\"type\"") &&
                (content.contains("tool_result") || content.contains("tool_use"))
            if (hasToolResult) {
                return false
            }
        }

        // 情况3：包含 tool_use_id 的内容
        if ((content.startsWith("[") || content.startsWith("{")) &&
            content.contains("tool_use_id")) {
            return false
        }

        // 过滤后内容为空则不显示
        return filterToolResultContent(content).isNotBlank()
    }

    // 助手消息：有内容或有关联的工具调用就显示
    return true
}

/**
 * 获取安全的助手消息内容（与Web端 getSafeAssistantContent 对齐）
 * 双重过滤保障，确保不会把 tool_result/tool_use JSON 显示在聊天界面中
 *
 * @param content 原始消息内容
 * @return 安全的内容文本
 */
fun getSafeAssistantContent(content: String): String {
    val filtered = filterToolResultContent(content)
    if (filtered.isBlank()) return ""

    val trimmed = filtered.trim()

    // 防御性检查：再次确认不是工具结果JSON
    val isToolJson = when {
        !trimmed.startsWith("[") && !trimmed.startsWith("{") -> false
        else -> trimmed.contains("tool_result") ||
                trimmed.contains("tool_use") ||
                trimmed.contains("tool_use_id")
    }

    return if (isToolJson) {
        ""
    } else {
        filtered
    }
}

/**
 * 格式化时间戳为可读格式
 */
private fun formatTimestamp(timestamp: String): String {
    return try {
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        val date = Date(timestamp.toLong())
        sdf.format(date)
    } catch (e: Exception) {
        ""
    }
}
