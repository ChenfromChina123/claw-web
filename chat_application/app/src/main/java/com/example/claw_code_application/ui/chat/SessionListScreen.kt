package com.example.claw_code_application.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.ui.theme.Color
import java.text.SimpleDateFormat
import java.util.*

/**
 * 会话列表界面
 * 复刻Vue前端SessionSidebar.vue的设计风格（暗色主题）
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
            .background(Color.BackgroundDark)
    ) {
        // 头部标题栏
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 标题
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.ChatBubbleOutline,
                    contentDescription = null,
                    tint = Color.Primary,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "会话列表",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.TextPrimary
                )
            }

            // 新建会话按钮
            FABMini(
                onClick = onCreateNew,
                icon = Icons.Default.Add,
                contentDescription = "新对话"
            )
        }

        Divider(color = Color.Divider, thickness = 1.dp)

        // 会话列表或空状态
        if (sessions.isEmpty()) {
            EmptyState()
        } else {
            LazyColumn(
                contentPadding = PaddingValues(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
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
 * 单个会话项
 */
@Composable
private fun SessionItem(
    session: Session,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(0.dp),
        color = if (isSelected) Color.SurfaceLight else Color.Transparent
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 左侧信息
            Column(modifier = Modifier.weight(1f)) {
                // 会话标题
                Text(
                    text = if (session.title.isNotEmpty()) session.title else "新对话",
                    fontSize = 15.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                    color = Color.TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(4.dp))

                // 元数据（时间 + 模型）
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = formatRelativeTime(session.updatedAt),
                        fontSize = 12.sp,
                        color = Color.TextSecondary
                    )
                    
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color.SurfaceDark
                    ) {
                        Text(
                            text = session.model,
                            fontSize = 11.sp,
                            color = Color.TextSecondary.copy(alpha = 0.7f),
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            // 右侧操作按钮（可选）
//            IconButton(onClick = { showMenu = true }, modifier = Modifier.size(32.dp)) {
//                Icon(
//                    imageVector = Icons.Default.MoreVert,
//                    contentDescription = "更多操作",
//                    tint = Color.TextSecondary,
//                    modifier = Modifier.size(18.dp)
//                )
//            }
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
                tint = Color.TextSecondary.copy(alpha = 0.5f),
                modifier = Modifier.size(64.dp)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = "暂无会话",
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = Color.TextSecondary
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "点击右上角"+"开始新对话",
                fontSize = 14.sp,
                color = Color.TextSecondary.copy(alpha = 0.7f)
            )
        }
    }
}

/**
 * 迷你FAB按钮
 */
@Composable
private fun FABMini(
    onClick: () -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String?
) {
    FloatingActionButton(
        onClick = onClick,
        modifier = Modifier.size(40.dp),
        containerColor = Color.Primary,
        contentColor = Color.TextPrimary,
        elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 2.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(20.dp)
        )
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
