package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.claw_code_application.data.api.models.PushCategory
import com.example.claw_code_application.data.api.models.PushPriority
import com.example.claw_code_application.data.local.PushMessageItem
import com.example.claw_code_application.data.local.PushMessageStore
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.ui.theme.AppColors
import java.text.SimpleDateFormat
import java.util.*

/**
 * 推送消息列表弹窗
 *
 * @param onDismiss 关闭回调
 * @param onMessageClick 消息点击回调
 */
@Composable
fun PushMessagesDialog(
    onDismiss: () -> Unit,
    onMessageClick: (PushMessageItem) -> Unit = {}
) {
    val colors = AppColor.current
    val context = androidx.compose.ui.platform.LocalContext.current
    val pushMessageStore = remember { PushMessageStore.getInstance(context) }
    val messages by pushMessageStore.messages.collectAsState()
    val unreadCount by pushMessageStore.unreadCount.collectAsState()
    var selectedCategory by remember { mutableStateOf<PushCategory?>(null) }

    // 过滤消息
    val filteredMessages = remember(messages, selectedCategory) {
        if (selectedCategory == null) {
            messages
        } else {
            messages.filter { it.message.category == selectedCategory }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.8f),
            shape = RoundedCornerShape(16.dp),
            color = colors.Surface
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // 标题栏
                DialogHeader(
                    unreadCount = unreadCount,
                    onDismiss = onDismiss,
                    onMarkAllRead = {
                        pushMessageStore.markAllAsRead()
                    },
                    onClearAll = {
                        pushMessageStore.clearAllMessages()
                    }
                )

                // 类别过滤器
                CategoryFilter(
                    selectedCategory = selectedCategory,
                    onCategorySelected = { selectedCategory = it }
                )

                HorizontalDivider(color = colors.Divider)

                // 消息列表
                if (filteredMessages.isEmpty()) {
                    EmptyMessageList()
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        items(
                            items = filteredMessages,
                            key = { it.message.id }
                        ) { item ->
                            MessageItem(
                                item = item,
                                onClick = {
                                    pushMessageStore.markAsRead(item.message.id)
                                    onMessageClick(item)
                                },
                                onDelete = {
                                    pushMessageStore.deleteMessage(item.message.id)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 弹窗标题栏
 */
@Composable
private fun DialogHeader(
    unreadCount: Int,
    onDismiss: () -> Unit,
    onMarkAllRead: () -> Unit,
    onClearAll: () -> Unit
) {
    val colors = AppColor.current
    var showMenu by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Notifications,
                contentDescription = null,
                tint = colors.Primary,
                modifier = Modifier.size(24.dp)
            )
            Text(
                text = "消息通知",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.TextPrimary
            )
            if (unreadCount > 0) {
                Badge(
                    containerColor = colors.Error
                ) {
                    Text(
                        text = unreadCount.toString(),
                        fontSize = 12.sp,
                        color = Color.White
                    )
                }
            }
        }

        Row {
            // 更多操作菜单
            Box {
                IconButton(onClick = { showMenu = true }) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "更多操作",
                        tint = colors.TextSecondary
                    )
                }

                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false },
                    containerColor = colors.Surface
                ) {
                    DropdownMenuItem(
                        text = { Text("全部标为已读", fontSize = 14.sp) },
                        onClick = {
                            onMarkAllRead()
                            showMenu = false
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.DoneAll,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("清空所有消息", fontSize = 14.sp, color = colors.Error) },
                        onClick = {
                            onClearAll()
                            showMenu = false
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.DeleteSweep,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                                tint = colors.Error
                            )
                        }
                    )
                }
            }

            IconButton(onClick = onDismiss) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "关闭",
                    tint = colors.TextSecondary
                )
            }
        }
    }
}

/**
 * 类别过滤器
 */
@Composable
private fun CategoryFilter(
    selectedCategory: PushCategory?,
    onCategorySelected: (PushCategory?) -> Unit
) {
    val colors = AppColor.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        FilterChip(
            selected = selectedCategory == null,
            onClick = { onCategorySelected(null) },
            label = { Text("全部", fontSize = 12.sp) },
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = colors.Primary,
                selectedLabelColor = Color.White
            )
        )

        FilterChip(
            selected = selectedCategory == PushCategory.CREDENTIAL,
            onClick = { onCategorySelected(PushCategory.CREDENTIAL) },
            label = { Text("凭证", fontSize = 12.sp) },
            leadingIcon = if (selectedCategory == PushCategory.CREDENTIAL) {
                {
                    Icon(
                        imageVector = Icons.Default.VpnKey,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                }
            } else null,
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = colors.Primary,
                selectedLabelColor = Color.White
            )
        )

        FilterChip(
            selected = selectedCategory == PushCategory.ALERT,
            onClick = { onCategorySelected(PushCategory.ALERT) },
            label = { Text("警告", fontSize = 12.sp) },
            leadingIcon = if (selectedCategory == PushCategory.ALERT) {
                {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                }
            } else null,
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = colors.Error,
                selectedLabelColor = Color.White
            )
        )

        FilterChip(
            selected = selectedCategory == PushCategory.NOTIFICATION,
            onClick = { onCategorySelected(PushCategory.NOTIFICATION) },
            label = { Text("通知", fontSize = 12.sp) },
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = colors.Primary,
                selectedLabelColor = Color.White
            )
        )
    }
}

/**
 * 消息项
 */
@Composable
private fun MessageItem(
    item: PushMessageItem,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val colors = AppColor.current
    val alpha = if (item.isRead) 0.6f else 1f
    val backgroundColor = if (item.isRead) {
        Color.Transparent
    } else {
        colors.Primary.copy(alpha = 0.05f)
    }

    var showDeleteConfirm by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(alpha)
            .background(backgroundColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 图标
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(getCategoryColor(item.message.category, colors)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = getCategoryIcon(item.message.category),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )
        }

        // 内容
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.message.title,
                    fontSize = 14.sp,
                    fontWeight = if (item.isRead) FontWeight.Normal else FontWeight.SemiBold,
                    color = colors.TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                // 未读指示器
                if (!item.isRead) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(colors.Error)
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = item.message.content,
                fontSize = 13.sp,
                color = colors.TextSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = formatTimestamp(item.receivedAt),
                fontSize = 11.sp,
                color = colors.TextSecondary.copy(alpha = 0.7f)
            )
        }

        // 删除按钮
        IconButton(
            onClick = { showDeleteConfirm = true },
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "删除",
                tint = colors.TextSecondary.copy(alpha = 0.5f),
                modifier = Modifier.size(18.dp)
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("确认删除", fontSize = 16.sp, fontWeight = FontWeight.SemiBold) },
            text = { Text("确定要删除这条消息吗？", fontSize = 14.sp) },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDelete()
                        showDeleteConfirm = false
                    }
                ) {
                    Text("删除", color = colors.Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("取消")
                }
            },
            containerColor = colors.Surface
        )
    }

    HorizontalDivider(color = colors.Divider, thickness = 0.5.dp)
}

/**
 * 空消息列表提示
 */
@Composable
private fun EmptyMessageList() {
    val colors = AppColor.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.NotificationsNone,
            contentDescription = null,
            tint = colors.TextSecondary.copy(alpha = 0.5f),
            modifier = Modifier.size(64.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "暂无消息",
            fontSize = 16.sp,
            color = colors.TextSecondary
        )
        Text(
            text = "Agent 推送的消息将显示在这里",
            fontSize = 13.sp,
            color = colors.TextSecondary.copy(alpha = 0.7f)
        )
    }
}

/**
 * 获取类别图标
 */
private fun getCategoryIcon(category: PushCategory): androidx.compose.ui.graphics.vector.ImageVector {
    return when (category) {
        PushCategory.CREDENTIAL -> Icons.Default.VpnKey
        PushCategory.ALERT -> Icons.Default.Warning
        PushCategory.NOTIFICATION -> Icons.Default.Notifications
        PushCategory.INFO -> Icons.Default.Info
    }
}

/**
 * 获取类别颜色
 */
private fun getCategoryColor(category: PushCategory, colors: AppColors): Color {
    return when (category) {
        PushCategory.CREDENTIAL -> colors.Primary
        PushCategory.ALERT -> colors.Error
        PushCategory.NOTIFICATION -> colors.Success
        PushCategory.INFO -> colors.TextSecondary
    }
}

/**
 * 格式化时间戳
 */
private fun formatTimestamp(timestamp: Long): String {
    val date = Date(timestamp)
    val now = Date()
    val diff = now.time - date.time

    return when {
        diff < 60 * 1000 -> "刚刚"
        diff < 60 * 60 * 1000 -> "${diff / (60 * 1000)}分钟前"
        diff < 24 * 60 * 60 * 1000 -> "${diff / (60 * 60 * 1000)}小时前"
        diff < 7 * 24 * 60 * 60 * 1000 -> "${diff / (24 * 60 * 60 * 1000)}天前"
        else -> SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(date)
    }
}
