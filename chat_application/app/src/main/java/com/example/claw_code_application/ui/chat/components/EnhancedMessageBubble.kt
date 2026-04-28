package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.data.api.models.ToolCall
import java.text.SimpleDateFormat
import java.util.*

/**
 * 增强版消息气泡组件
 * 支持用户消息和AI助手消息的显示
 * 改进：使用 MessageContentParser 解析 content 字段（支持 String 和 JsonArray 格式）
 */
@Composable
fun EnhancedMessageBubble(
    message: Message,
    toolCalls: List<ToolCall> = emptyList(),
    isLast: Boolean = false,
    onToolCallClick: (ToolCall) -> Unit = {},
    onCopy: (String) -> Unit = {},
    onRegenerate: () -> Unit = {}
) {
    val isUser = message.role == "user"
    val isStreaming = message.isStreaming

    // 使用新的 parseFromMessage 方法解析内容
    val components = remember(message.content) {
        MessageContentParser.parseFromMessage(message)
    }

    // 获取纯文本内容（用于复制）
    val textContent = remember(message.content) {
        message.getTextContent()
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
                    topStart = 20.dp,
                    topEnd = 20.dp,
                    bottomStart = if (isUser) 20.dp else 6.dp,
                    bottomEnd = if (isUser) 6.dp else 20.dp
                ),
                color = if (isUser) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surface
                },
                shadowElevation = if (isUser) 0.dp else 2.dp,
                modifier = Modifier
                    .border(
                        width = if (isUser) 0.dp else 1.dp,
                        color = if (isUser) {
                            Color.Transparent
                        } else {
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.15f)
                        },
                        shape = RoundedCornerShape(
                            topStart = 20.dp,
                            topEnd = 20.dp,
                            bottomStart = if (isUser) 20.dp else 6.dp,
                            bottomEnd = if (isUser) 6.dp else 20.dp
                        )
                    )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // 渲染消息组件
                    components.forEach { component ->
                        EnhancedMessageComponentRenderer(
                            component = component,
                            isUser = isUser
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
                        EnhancedStreamingIndicator()
                    }
                }
            }

            // 底部操作栏（仅AI消息且非流式状态显示）
            if (!isUser && !isStreaming && isLast) {
                MessageActionBar(
                    content = textContent,
                    onCopy = onCopy,
                    onRegenerate = onRegenerate
                )
            }

            // 时间戳
            Text(
                text = formatEnhancedTimestamp(message.timestamp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                modifier = Modifier.padding(top = 6.dp)
            )
        }

        if (isUser) {
            Spacer(modifier = Modifier.width(12.dp))
            // 用户头像
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = "User",
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

/**
 * 增强版消息组件渲染器
 */
@Composable
private fun EnhancedMessageComponentRenderer(
    component: MessageComponent,
    isUser: Boolean
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
                style = MaterialTheme.typography.bodyLarge.copy(
                    lineHeight = 24.sp
                ),
                color = contentColor
            )
        }

        is MessageComponent.ToolUse -> {
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
            val summary = if (component.isSuccess) "✓ 执行成功" else "✗ 执行失败"
            Text(
                text = summary,
                style = MaterialTheme.typography.bodyMedium,
                color = if (component.isSuccess) Color(0xFF22C55E) else Color(0xFFEF4444)
            )
        }

        is MessageComponent.FileListResult -> {
            EnhancedFileListSummary(path = component.path, count = component.count)
        }

        is MessageComponent.SearchResult -> {
            EnhancedSearchResultSummary(
                matchCount = component.matchCount,
                summary = component.summary
            )
        }

        is MessageComponent.FileContentResult -> {
            EnhancedFileContentSummary(
                path = component.path,
                lineCount = component.lineCount
            )
        }

        is MessageComponent.ErrorResult -> {
            EnhancedErrorResultSummary(error = component.error)
        }

        else -> {
            // 其他类型暂不显示
        }
    }
}

/**
 * 文件列表摘要（增强版）
 */
@Composable
private fun EnhancedFileListSummary(path: String, count: Int) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(text = "📁", fontSize = 18.sp)
            Column {
                Text(
                    text = "文件列表",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
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
 * 搜索结果摘要（增强版）
 */
@Composable
private fun EnhancedSearchResultSummary(matchCount: Int, summary: String) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.08f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(text = "🔍", fontSize = 18.sp)
            Column {
                Text(
                    text = "搜索结果",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
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
 * 文件内容摘要（增强版）
 */
@Composable
private fun EnhancedFileContentSummary(path: String, lineCount: Int) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.08f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(text = "📄", fontSize = 18.sp)
            Column {
                Text(
                    text = "文件内容",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
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
 * 错误结果摘要（增强版）
 */
@Composable
private fun EnhancedErrorResultSummary(error: String) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = Color(0xFFEF4444).copy(alpha = 0.08f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(text = "⚠️", fontSize = 18.sp)
            Column {
                Text(
                    text = "错误",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
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
 * 消息操作栏
 */
@Composable
private fun MessageActionBar(
    content: String,
    onCopy: (String) -> Unit,
    onRegenerate: () -> Unit
) {
    Row(
        modifier = Modifier
            .padding(top = 8.dp, start = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        IconButton(
            onClick = { onCopy(content) },
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.ContentCopy,
                contentDescription = "复制",
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
        }

        IconButton(
            onClick = onRegenerate,
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Refresh,
                contentDescription = "重新生成",
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
        }
    }
}

/**
 * 增强版流式输出指示器
 */
@Composable
private fun EnhancedStreamingIndicator() {
    Row(
        modifier = Modifier.padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(3) { index ->
            val delay = index * 200
            val infiniteTransition = rememberInfiniteTransition(label = "dot_$index")
            val alpha by infiniteTransition.animateFloat(
                initialValue = 0.4f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(400, delayMillis = delay, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "alpha_$index"
            )
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = alpha))
            )
        }
    }
}

/**
 * 格式化时间戳（增强版）
 */
private fun formatEnhancedTimestamp(timestamp: String?): String {
    if (timestamp == null) return ""
    return try {
        val time = timestamp.toLong()
        val date = Date(time)
        val now = Date()
        val diff = now.time - date.time

        when {
            diff < 60000 -> "刚刚"
            diff < 3600000 -> "${diff / 60000}分钟前"
            diff < 86400000 -> SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
            else -> SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()).format(date)
        }
    } catch (e: Exception) {
        ""
    }
}
