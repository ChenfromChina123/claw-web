package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.ToolCall
import java.text.SimpleDateFormat
import java.util.*

/**
 * 消息气泡组件
 * 支持用户消息和AI助手消息的显示
 * 改进：使用 MessageContentParser 解析 content 字段（支持 String 和 JsonArray 格式）
 */
@Composable
fun MessageBubble(
    message: Message,
    toolCalls: List<ToolCall> = emptyList(),
    onToolCallClick: (ToolCall) -> Unit = {}
) {
    val isUser = message.role == "user"
    val isStreaming = message.isStreaming

    // 使用新的 parseFromMessage 方法解析内容
    val components = remember(message.content) {
        MessageContentParser.parseFromMessage(message)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        if (!isUser) {
            // AI头像
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.SmartToy,
                    contentDescription = "AI",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
        }

        Column(
            modifier = Modifier.weight(1f, fill = false),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
        ) {
            // 消息气泡
            Surface(
                shape = RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (isUser) 16.dp else 4.dp,
                    bottomEnd = if (isUser) 4.dp else 16.dp
                ),
                color = if (isUser) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                },
                modifier = Modifier
                    .border(
                        width = 1.dp,
                        color = if (isUser) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                        },
                        shape = RoundedCornerShape(
                            topStart = 16.dp,
                            topEnd = 16.dp,
                            bottomStart = if (isUser) 16.dp else 4.dp,
                            bottomEnd = if (isUser) 4.dp else 16.dp
                        )
                    )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // 渲染消息组件
                    components.forEach { component ->
                        MessageComponentRenderer(
                            component = component,
                            isUser = isUser,
                            onToolCallClick = onToolCallClick
                        )
                    }

                    // 渲染关联的工具调用
                    toolCalls.forEach { toolCall ->
                        ToolCallCard(
                            toolCall = toolCall,
                            onExpandedChange = {}
                        )
                    }

                    // 流式输出指示器
                    if (isStreaming) {
                        StreamingIndicator()
                    }
                }
            }

            // 时间戳
            Text(
                text = formatTimestamp(message.timestamp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        if (isUser) {
            Spacer(modifier = Modifier.width(12.dp))
            // 用户头像
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = "User",
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

/**
 * 消息组件渲染器
 * 根据组件类型渲染不同的UI
 */
@Composable
private fun MessageComponentRenderer(
    component: MessageComponent,
    isUser: Boolean,
    onToolCallClick: (ToolCall) -> Unit
) {
    val contentColor = if (isUser) {
        MaterialTheme.colorScheme.onPrimary
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    when (component) {
        is MessageComponent.Text -> {
            Text(
                text = component.content,
                style = MaterialTheme.typography.bodyLarge,
                color = contentColor
            )
        }

        is MessageComponent.ToolUse -> {
            // 使用 ToolCallCard 显示工具调用
            ToolCallCard(
                toolCall = ToolCall(
                    id = component.id,
                    toolName = component.toolName,
                    toolInput = component.input,
                    toolOutput = null,
                    status = "pending",
                    createdAt = ""
                ),
                onExpandedChange = {}
            )
        }

        is MessageComponent.ToolResult -> {
            // 工具结果通过 ToolCallCard 显示
            // 这里只显示文本摘要
            val summary = if (component.isSuccess) {
                "✓ 执行成功"
            } else {
                "✗ 执行失败"
            }
            Text(
                text = summary,
                style = MaterialTheme.typography.bodyMedium,
                color = if (component.isSuccess) Color(0xFF22C55E) else Color(0xFFEF4444)
            )
        }

        is MessageComponent.FileListResult -> {
            FileListSummary(
                path = component.path,
                count = component.count
            )
        }

        is MessageComponent.SearchResult -> {
            SearchResultSummary(
                matchCount = component.matchCount,
                summary = component.summary
            )
        }

        is MessageComponent.FileContentResult -> {
            FileContentSummary(
                path = component.path,
                lineCount = component.lineCount
            )
        }

        is MessageComponent.ErrorResult -> {
            ErrorResultSummary(
                error = component.error
            )
        }

        else -> {
            // 其他类型暂不显示
        }
    }
}

/**
 * 文件列表摘要
 */
@Composable
private fun FileListSummary(path: String, count: Int) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = "📁", fontSize = 16.sp)
            Column {
                Text(
                    text = "文件列表",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "$path · $count 个文件",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
    }
}

/**
 * 搜索结果摘要
 */
@Composable
private fun SearchResultSummary(matchCount: Int, summary: String) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.1f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = "🔍", fontSize = 16.sp)
            Column {
                Text(
                    text = "搜索结果",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = summary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
    }
}

/**
 * 文件内容摘要
 */
@Composable
private fun FileContentSummary(path: String, lineCount: Int) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.1f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = "📄", fontSize = 16.sp)
            Column {
                Text(
                    text = "文件内容",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "$path · $lineCount 行",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
    }
}

/**
 * 错误结果摘要
 */
@Composable
private fun ErrorResultSummary(error: String) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFFEF4444).copy(alpha = 0.1f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = "⚠️", fontSize = 16.sp)
            Column {
                Text(
                    text = "错误",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFFEF4444)
                )
                Text(
                    text = error.take(100),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFEF4444).copy(alpha = 0.8f)
                )
            }
        }
    }
}

/**
 * 流式输出指示器
 */
@Composable
private fun StreamingIndicator() {
    Row(
        modifier = Modifier.padding(top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        repeat(3) { index ->
            val delay = index * 150
            val infiniteTransition = rememberInfiniteTransition(label = "dot_$index")
            val alpha by infiniteTransition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(300, delayMillis = delay, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "alpha_$index"
            )
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = alpha))
            )
        }
    }
}

/**
 * 格式化时间戳
 */
private fun formatTimestamp(timestamp: String?): String {
    if (timestamp == null) return ""
    return try {
        val time = timestamp.toLong()
        val date = Date(time)
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
    } catch (e: Exception) {
        ""
    }
}

/**
 * 判断消息是否应该显示
 * 过滤掉 tool_result 类型的消息（与 Web 端 shouldShowMessage 对齐）
 */
fun shouldShowMessage(message: Message): Boolean {
    // 过滤掉 content 是 tool_result 的消息
    if (message.isToolResultContent()) {
        return false
    }
    return true
}
