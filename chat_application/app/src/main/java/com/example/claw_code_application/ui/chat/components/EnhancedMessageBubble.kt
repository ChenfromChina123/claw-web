package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
import com.example.claw_code_application.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*
import com.google.gson.JsonPrimitive

/**
 * 增强版消息气泡组件
 * 支持用户消息和AI助手消息的显示，包含更丰富的交互和样式
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
            // AI头像 - 带渐变背景
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(
                        brush = androidx.compose.ui.graphics.Brush.linearGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primary,
                                MaterialTheme.colorScheme.tertiary
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.SmartToy,
                    contentDescription = "AI",
                    tint = Color.White,
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
                    .background(
                        brush = androidx.compose.ui.graphics.Brush.linearGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primaryContainer,
                                MaterialTheme.colorScheme.secondaryContainer
                            )
                        )
                    ),
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
 * 根据组件类型渲染不同的UI，带更丰富的样式
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
            EnhancedToolUseCard(
                toolCall = ToolCall(
                    id = component.id,
                    toolName = component.toolName,
                    toolInput = component.input,
                    toolOutput = null,
                    status = "pending",
                    createdAt = ""
                ),
                onClick = {}
            )
        }

        is MessageComponent.ToolResult -> {
            EnhancedToolResultCard(
                toolCall = ToolCall(
                    id = component.toolUseId,
                    toolName = "执行结果",
                    toolInput = emptyMap(),
                    toolOutput = mapOf(
                        "stdout" to component.stdout,
                        "stderr" to component.stderr,
                        "exitCode" to component.exitCode
                    ),
                    status = if (component.isSuccess) "completed" else "error",
                    createdAt = ""
                ),
                onClick = {}
            )
        }

        is MessageComponent.FileListResult -> {
            EnhancedFileListCard(
                path = component.path,
                count = component.count,
                files = component.files,
                onClick = {}
            )
        }

        is MessageComponent.SearchResult -> {
            EnhancedSearchResultCard(
                matchCount = component.matchCount,
                matchedFiles = component.matchedFiles,
                summary = component.summary,
                onClick = {}
            )
        }

        is MessageComponent.FileContentResult -> {
            EnhancedFileContentCard(
                path = component.path,
                content = component.content,
                lineCount = component.lineCount,
                onClick = {}
            )
        }

        is MessageComponent.ErrorResult -> {
            EnhancedErrorResultCard(
                error = component.error,
                errorType = component.errorType
            )
        }

        else -> {
            // 其他类型暂不显示
        }
    }
}

/**
 * 消息操作栏
 * 复制、重新生成等功能
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
        // 复制按钮
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

        // 重新生成按钮
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
            val scale by animateFloatAsState(
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = keyframes {
                        durationMillis = 1200
                        0.6f at delay
                        1.2f at delay + 400
                        0.6f at delay + 800
                    },
                    repeatMode = RepeatMode.Restart
                ),
                label = "dot_$index"
            )
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .scale(scale)
                    .clip(CircleShape)
                    .background(
                        brush = androidx.compose.ui.graphics.Brush.radialGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primary,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)
                            )
                        )
                    )
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

// 扩展函数：缩放修饰符
private fun Modifier.scale(scale: Float): Modifier = this.then(
    androidx.compose.ui.draw.DrawModifier {
        drawContent()
    }
)
