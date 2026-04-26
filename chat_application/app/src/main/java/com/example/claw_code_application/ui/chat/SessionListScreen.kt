package com.example.claw_code_application.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.ui.theme.AppColor
import java.text.SimpleDateFormat
import java.util.*

/**
 * 会话列表界面
 * 基于原型Manus风格设计 - 浅色主题
 */
@Composable
fun SessionListScreen(
    sessions: List<Session>,
    currentSessionId: String?,
    onSelect: (String) -> Unit,
    onCreateNew: () -> Unit,
    onDelete: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(AppColor.BackgroundDark)
    ) {
        // 头部标题栏 - 原型样式
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(AppColor.SurfaceDark)
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 标题
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.ChatBubbleOutline,
                    contentDescription = null,
                    tint = AppColor.TextPrimary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Manus",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = AppColor.TextPrimary
                )
                Spacer(modifier = Modifier.width(6.dp))
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = AppColor.SurfaceLight
                ) {
                    Text(
                        text = "1.6 Lite",
                        fontSize = 11.sp,
                        color = AppColor.TextSecondary,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            // 新建会话按钮 - 原型样式圆形按钮
            Surface(
                modifier = Modifier.size(32.dp),
                shape = RoundedCornerShape(16.dp),
                color = AppColor.SurfaceLight,
                shadowElevation = 1.dp
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = "+",
                        fontSize = 20.sp,
                        color = AppColor.TextPrimary
                    )
                }
            }
        }

        HorizontalDivider(color = AppColor.Divider, thickness = 1.dp)

        // 会话列表或空状态
        if (sessions.isEmpty()) {
            EmptyState()
        } else {
            LazyColumn(
                contentPadding = PaddingValues(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                items(sessions, key = { it.id }) { session ->
                    SessionItem(
                        session = session,
                        isSelected = session.id == currentSessionId,
                        onClick = { onSelect(session.id) },
                        onDelete = { onDelete(session.id) }
                    )
                }
            }
        }
    }
}

/**
 * 单个会话项 - 原型样式
 */
@Composable
private fun SessionItem(
    session: Session,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        color = if (isSelected) AppColor.SurfaceLight else androidx.compose.ui.graphics.Color.Transparent
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            // 会话标题
            Text(
                text = if (session.title.isNotEmpty()) session.title else "新对话",
                fontSize = 14.sp,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                color = AppColor.TextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(6.dp))

            // 元数据（时间 + 模型）
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = formatRelativeTime(session.updatedAt),
                    fontSize = 12.sp,
                    color = AppColor.TextSecondary
                )
                
                Text(
                    text = "·",
                    fontSize = 12.sp,
                    color = AppColor.TextSecondary
                )
                
                Text(
                    text = session.model,
                    fontSize = 12.sp,
                    color = AppColor.TextSecondary
                )
            }
        }
    }
}

/**
 * 空状态提示
 */
@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.ChatBubbleOutline,
                contentDescription = null,
                tint = AppColor.TextSecondary.copy(alpha = 0.5f),
                modifier = Modifier.size(64.dp)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = "暂无会话",
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = AppColor.TextSecondary
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "点击右上角开始新对话",
                fontSize = 14.sp,
                color = AppColor.TextSecondary.copy(alpha = 0.7f)
            )
        }
    }
}

/**
 * 格式化为相对时间显示
 */
private fun formatRelativeTime(dateStr: String): String {
    return try {
        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).parse(dateStr)
            ?: return ""
        
        val now = Date()
        val diff = now.time - date.time
        
        when {
            diff < 60_000L -> "刚刚"
            diff < 3_600_000L -> "${diff / 60_000L}分钟前"
            diff < 86_400_000L -> "${diff / 3_600_000L}小时前"
            diff < 604_800_000L -> "${diff / 86_400_000L}天前"
            else -> SimpleDateFormat("MM-dd", Locale.getDefault()).format(date)
        }
    } catch (e: Exception) {
        ""
    }
}
