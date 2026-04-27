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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.theme.AppColor
import dev.jeziellago.compose.markdowntext.MarkdownText
import java.text.SimpleDateFormat
import java.util.*

/**
 * 增强版消息气泡组件
 * 支持：Markdown渲染、动态组件渲染（终端/代码差异/步骤进度）、流式输出动画
 */
@Composable
fun EnhancedMessageBubble(
    message: Message,
    toolCalls: List<ToolCall> = emptyList(),
    modifier: Modifier = Modifier
) {
    val isUser = message.role == "user"

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
            // 消息内容卡片
            Surface(
                shape = RoundedCornerShape(
                    topStart = if (isUser) 16.dp else 12.dp,
                    topEnd = if (isUser) 4.dp else 16.dp,
                    bottomStart = 16.dp,
                    bottomEnd = 16.dp
                ),
                color = if (isUser) AppColor.UserBubbleBackground else AppColor.AssistantBubbleBackground,
                shadowElevation = if (isUser) 0.dp else 1.dp,
                border = if (isUser) null else androidx.compose.foundation.BorderStroke(1.dp, AppColor.Border)
            ) {
                Column(
                    modifier = Modifier.padding(
                        horizontal = 14.dp,
                        vertical = 10.dp
                    )
                ) {
                    // 动态组件渲染
                    if (isUser) {
                        /**
                         * 用户消息内容过滤（与Web端三重过滤对齐）
                         * Anthropic API 会将 tool_result 包装成 user 角色消息发送给 Agent
                         * 需要过滤掉这些内部消息，避免显示原始 JSON
                         */
                        val filteredContent = remember(message.content) {
                            getSafeAssistantContent(message.content)
                        }
                        
                        if (filteredContent.isNotBlank()) {
                            Text(
                                text = filteredContent,
                                color = AppColor.SurfaceDark,
                                fontSize = 14.sp,
                                lineHeight = 20.sp
                            )
                        }
                    } else {
                        // AI消息使用动态组件渲染
                        DynamicMessageContent(
                            content = message.content,
                            isStreaming = message.isStreaming
                        )
                    }

                    // 流式输出光标动画
                    if (message.isStreaming && !isUser) {
                        StreamingCursor()
                    }
                }
            }

            // 工具调用显示 - 使用增强版可折叠卡片
            if (toolCalls.isNotEmpty() && !isUser) {
                Spacer(modifier = Modifier.height(8.dp))
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    toolCalls.forEach { toolCall ->
                        var expanded by remember { mutableStateOf(false) }
                        ToolCallCard(
                            toolCall = toolCall,
                            expanded = expanded,
                            onExpandedChange = { expanded = it }
                        )
                    }
                }
            }

            // 时间戳
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
 * 动态消息内容渲染
 * 根据内容类型渲染不同组件
 */
@Composable
private fun DynamicMessageContent(
    content: String,
    isStreaming: Boolean
) {
    // 解析消息内容为组件列表
    val components = remember(content) {
        MessageContentParser.parse(content)
    }

    // 渲染每个组件
    components.forEach { component ->
        when (component) {
            is MessageComponent.Text -> {
                MarkdownText(
                    markdown = component.content,
                    modifier = Modifier.fillMaxWidth(),
                    color = AppColor.TextPrimary,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )
            }

            is MessageComponent.ToolUse -> {
                ToolUseComponent(
                    toolUse = component,
                    isExecuting = isStreaming
                )
            }

            is MessageComponent.ToolResult -> {
                TerminalViewer(
                    command = component.stdout.lines().firstOrNull() ?: "",
                    stdout = component.stdout,
                    stderr = component.stderr,
                    exitCode = component.exitCode,
                    isExecuting = false
                )
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
        }

        // 组件之间添加间距
        if (component !== components.lastOrNull()) {
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

/**
 * 工具调用组件
 */
@Composable
private fun ToolUseComponent(
    toolUse: MessageComponent.ToolUse,
    isExecuting: Boolean
) {
    val command = toolUse.input["command"] ?: toolUse.input["cmd"] ?: ""

    if (command.isNotBlank()) {
        // 显示为终端卡片（执行中状态）
        TerminalViewer(
            command = command,
            stdout = "",
            stderr = "",
            exitCode = 0,
            isExecuting = isExecuting
        )
    } else {
        // 显示为通用工具卡片
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(
                containerColor = AppColor.SurfaceLight
            ),
            border = androidx.compose.foundation.BorderStroke(1.dp, AppColor.Border)
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "⚙️", fontSize = 16.sp)
                Text(
                    text = "正在执行: ${toolUse.toolName}",
                    fontSize = 13.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium
                )
            }
        }
    }
}

/**
 * 流式输出光标动画
 */
@Composable
private fun StreamingCursor() {
    val infiniteTransition = rememberInfiniteTransition(label = "cursor")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "cursor_alpha"
    )

    Text(
        text = "▋",
        color = AppColor.Primary,
        modifier = Modifier.alpha(alpha),
        fontSize = 14.sp
    )
}

/**
 * 文件列表查看器组件
 * 显示 FileList 工具返回的文件和目录列表
 */
@Composable
private fun FileListViewer(
    path: String,
    count: Int,
    files: List<FileInfo>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.SurfaceLight
        ),
        border = BorderStroke(1.dp, AppColor.Border)
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            // 路径标题
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "📁", fontSize = 16.sp)
                Text(
                    text = path,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = AppColor.TextPrimary
                )
                Text(
                    text = "($count 项)",
                    fontSize = 11.sp,
                    color = AppColor.TextSecondary
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            HorizontalDivider(color = AppColor.Divider, thickness = 1.dp)

            Spacer(modifier = Modifier.height(8.dp))

            // 文件列表
            files.forEach { file ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // 文件/目录图标
                    Text(
                        text = if (file.isDirectory) "📂" else "📄",
                        fontSize = 14.sp
                    )

                    // 文件名
                    Text(
                        text = file.name,
                        fontSize = 12.sp,
                        color = if (file.isDirectory) AppColor.Primary else AppColor.TextPrimary,
                        fontWeight = if (file.isDirectory) FontWeight.Medium else FontWeight.Normal,
                        modifier = Modifier.weight(1f)
                    )

                    // 类型标签
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = if (file.isDirectory) 
                            AppColor.Primary.copy(alpha = 0.1f) 
                        else 
                            AppColor.TextSecondary.copy(alpha = 0.1f)
                    ) {
                        Text(
                            text = if (file.isDirectory) "目录" else "文件",
                            fontSize = 10.sp,
                            color = if (file.isDirectory) AppColor.Primary else AppColor.TextSecondary,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
        }
    }
}

/**
 * 搜索结果查看器组件
 */
@Composable
private fun SearchResultViewer(
    summary: String,
    matchCount: Int,
    matchedFiles: List<String>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.SurfaceLight
        ),
        border = BorderStroke(1.dp, AppColor.Border)
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "🔍", fontSize = 16.sp)
                Text(
                    text = summary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = AppColor.TextPrimary
                )
            }

            if (matchedFiles.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = AppColor.Divider, thickness = 1.dp)
                Spacer(modifier = Modifier.height(8.dp))

                matchedFiles.take(10).forEach { filePath ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(text = "📄", fontSize = 12.sp)
                        Text(
                            text = filePath,
                            fontSize = 11.sp,
                            color = AppColor.TextSecondary,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                if (matchedFiles.size > 10) {
                    Text(
                        text = "...还有 ${matchedFiles.size - 10} 个文件",
                        fontSize = 11.sp,
                        color = AppColor.TextSecondary,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        }
    }
}

/**
 * 文件内容读取结果查看器组件
 */
@Composable
private fun FileContentViewer(
    path: String,
    content: String,
    lineCount: Int,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.SurfaceLight
        ),
        border = BorderStroke(1.dp, AppColor.Border)
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "📄", fontSize = 16.sp)
                if (path.isNotEmpty()) {
                    Text(
                        text = path,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = AppColor.Primary
                    )
                }
                Text(
                    text = "($lineCount 行)",
                    fontSize = 11.sp,
                    color = AppColor.TextSecondary
                )
            }

            if (content.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = AppColor.Divider, thickness = 1.dp)
                Spacer(modifier = Modifier.height(8.dp))

                val displayContent = if (content.length > 500) {
                    content.take(500) + "\n... (已截断)"
                } else {
                    content
                }

                Text(
                    text = displayContent,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = AppColor.TextPrimary,
                    lineHeight = 16.sp
                )
            }
        }
    }
}

/**
 * 错误结果查看器组件
 */
@Composable
private fun ErrorResultViewer(
    error: String,
    errorType: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.Error.copy(alpha = 0.05f)
        ),
        border = BorderStroke(1.dp, AppColor.Error.copy(alpha = 0.3f))
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "❌", fontSize = 16.sp)
                Text(
                    text = "错误: $errorType",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = AppColor.Error
                )
            }

            if (error.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = error,
                    fontSize = 12.sp,
                    color = AppColor.Error.copy(alpha = 0.8f),
                    fontFamily = FontFamily.Monospace
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
        android.util.Log.d("MessageFilter", "过滤掉 tool_result/tool_use JSON: ${trimmed.take(100)}...")
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
                android.util.Log.d("MessageFilter", "shouldShowMessage: 隐藏 tool_result 数组格式用户消息")
                return false
            }
        }

        // 情况2：content 是 JSON 对象格式
        if (content.startsWith("{") && content.endsWith("}")) {
            val hasToolResult = content.contains("\"type\"") &&
                (content.contains("tool_result") || content.contains("tool_use"))
            if (hasToolResult) {
                android.util.Log.d("MessageFilter", "shouldShowMessage: 隐藏 tool_result 对象格式用户消息")
                return false
            }
        }

        // 情况3：包含 tool_use_id 的内容
        if ((content.startsWith("[") || content.startsWith("{")) &&
            content.contains("tool_use_id")) {
            android.util.Log.d("MessageFilter", "shouldShowMessage: 隐藏 tool_use_id 用户消息")
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
        android.util.Log.d("MessageFilter", "getSafeAssistantContent: 二次过滤掉工具JSON")
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
