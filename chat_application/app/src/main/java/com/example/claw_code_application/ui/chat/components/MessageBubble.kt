package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.ui.theme.BubbleThemeColors
import java.text.SimpleDateFormat
import java.util.*

/**
 * 消息气泡组件
 * 基于原型Manus风格设计 - 支持主题切换
 */
@Composable
fun MessageBubble(
    message: Message,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    val bubbleColors = BubbleThemeColors.current
    val isUser = message.role == "user"

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
        ) {
            Surface(
                shape = RoundedCornerShape(
                    topStart = if (isUser) 16.dp else 12.dp,
                    topEnd = if (isUser) 4.dp else 16.dp,
                    bottomStart = 16.dp,
                    bottomEnd = 16.dp
                ),
                color = if (isUser) bubbleColors.background else colors.AssistantBubbleBackground,
                shadowElevation = if (isUser) 0.dp else 1.dp,
                border = if (isUser) null else androidx.compose.foundation.BorderStroke(1.dp, colors.Border)
            ) {
                Row(
                    verticalAlignment = Alignment.Bottom
                ) {
                    Text(
                        text = message.content,
                        color = if (isUser) bubbleColors.textColor else colors.TextPrimary,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        modifier = Modifier.padding(
                            horizontal = 14.dp,
                            vertical = 10.dp
                        )
                    )

                    if (message.isStreaming) {
                        Text(
                            text = "▋",
                            color = if (isUser) bubbleColors.textColor else colors.Primary,
                            modifier = Modifier.padding(end = 14.dp, bottom = 10.dp)
                        )
                    }
                }
            }

            Text(
                text = formatTimestamp(message.timestamp),
                color = colors.TextSecondary,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp)
            )
        }
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
