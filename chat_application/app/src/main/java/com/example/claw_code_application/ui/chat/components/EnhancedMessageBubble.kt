package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
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
 * 支持：Markdown渲染、工具调用显示、流式输出动画
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
                    // 消息内容 - 使用Markdown渲染
                    if (isUser) {
                        // 用户消息直接显示文本
                        Text(
                            text = message.content,
                            color = AppColor.SurfaceDark,
                            fontSize = 14.sp,
                            lineHeight = 20.sp
                        )
                    } else {
                        // AI消息使用Markdown渲染
                        MarkdownContent(
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
 * Markdown内容渲染
 */
@Composable
private fun MarkdownContent(
    content: String,
    isStreaming: Boolean
) {
    // 处理工具结果JSON，提取可读的文本
    val processedContent = remember(content) {
        processToolResults(content)
    }

    MarkdownText(
        markdown = processedContent,
        modifier = Modifier.fillMaxWidth(),
        color = AppColor.TextPrimary,
        fontSize = 14.sp,
        lineHeight = 20.sp
    )
}

/**
 * 处理工具结果，将JSON转换为可读文本
 */
private fun processToolResults(content: String): String {
    // 尝试解析工具结果JSON
    return try {
        if (content.contains("tool_result") || content.contains("\"type\":\"tool")) {
            // 提取工具结果中的stdout内容
            val stdoutPattern = """"stdout":"([^"]*)"""".toRegex()
            val matches = stdoutPattern.findAll(content)
            val outputs = matches.map { it.groupValues[1] }
                .map { it.replace("\\n", "\n").replace("\\t", "\t") }
                .filter { it.isNotBlank() }
                .toList()

            if (outputs.isNotEmpty()) {
                outputs.joinToString("\n\n---\n\n")
            } else {
                content
            }
        } else {
            content
        }
    } catch (e: Exception) {
        content
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
