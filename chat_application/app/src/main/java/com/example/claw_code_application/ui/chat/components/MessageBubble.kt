package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Message
import com.example.claw_code_application.ui.theme.AppColor
import java.text.SimpleDateFormat
import java.util.*

/**
 * 消息气泡组件
 * 复刻Vue前端ChatMessage.vue的设计风格
 */
@Composable
fun MessageBubble(
    message: Message,
    modifier: Modifier = Modifier
) {
    val isUser = message.role == "user"

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        if (!isUser) {
            Avatar(isUser = false)
            Spacer(modifier = Modifier.width(8.dp))
        }

        Column(
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
        ) {
            // AI消息显示角色标签
            if (!isUser) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = AppColor.Primary.copy(alpha = 0.2f)
                ) {
                    Text(
                        text = "Claude",
                        color = AppColor.Primary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
            }

            // 消息内容卡片
            Box(
                modifier = Modifier
                    .background(
                        color = if (isUser) AppColor.UserBubbleBackground else AppColor.AssistantBubbleBackground,
                        shape = RoundedCornerShape(12.dp)
                    )
                    .padding(12.dp)
            ) {
                Text(
                    text = message.content,
                    color = AppColor.TextPrimary,
                    fontSize = 15.sp,
                    lineHeight = 20.sp
                )

                // 流式输出光标
                if (message.isStreaming) {
                    Text(
                        text = "▋",
                        color = AppColor.Primary,
                        modifier = Modifier.padding(start = 4.dp)
                    )
                }
            }

            // 时间戳
            Text(
                text = formatTimestamp(message.timestamp),
                color = AppColor.TextSecondary,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        if (isUser) {
            Spacer(modifier = Modifier.width(8.dp))
            Avatar(isUser = true)
        }
    }
}

/**
 * 用户/AI头像组件
 */
@Composable
private fun Avatar(isUser: Boolean) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(if (isUser) AppColor.Primary.copy(alpha = 0.3f) else AppColor.SurfaceLight),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = if (isUser) "👤" else "🤖",
            fontSize = 18.sp
        )
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
