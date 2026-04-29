package com.example.claw_code_application.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.InsertChart
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Session
import com.example.claw_code_application.ui.theme.AppColor
import java.text.SimpleDateFormat
import java.util.*

/**
 * 会话列表界面 - Manus 风格设计
 * 集成搜索功能和滑动删除，支持暗色主题
 * 显示最新消息摘要和AI运行状态
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionListScreen(
    sessions: List<Session>,
    currentSessionId: String?,
    onSelect: (String) -> Unit,
    onCreateNew: () -> Unit,
    onDelete: (String) -> Unit,
    onAvatarClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var isSearchExpanded by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf(TextFieldValue("")) }

    val isDarkTheme = !isSystemInDarkTheme().not()

    val sessionDisplayData = remember(
        sessions.map { it.id to it.updatedAt to it.lastMessage to it.isRunning }.hashCode()
    ) {
        sessions.map { session ->
            SessionDisplayData(
                id = session.id,
                title = session.title.ifEmpty { "新对话" },
                previewText = session.lastMessage?.takeIf { it.isNotBlank() } ?: generatePreview(session.title),
                timeText = formatTime(session.updatedAt),
                iconType = getIconType(session.title),
                iconBgColor = getIconBgColor(session.title, isDarkTheme),
                isRunning = session.isRunning
            )
        }
    }

    val filteredData = remember(
        sessionDisplayData,
        searchQuery.text,
        sessionDisplayData.map { it.id }.hashCode()
    ) {
        if (searchQuery.text.isBlank()) {
            sessionDisplayData
        } else {
            sessionDisplayData.filter {
                it.title.contains(searchQuery.text, ignoreCase = true) ||
                it.previewText.contains(searchQuery.text, ignoreCase = true)
            }
        }
    }

    val backgroundColor = MaterialTheme.colorScheme.background
    val surfaceColor = MaterialTheme.colorScheme.surface

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(backgroundColor)
    ) {
        TopAppBarWithSearch(
            isSearchExpanded = isSearchExpanded,
            onSearchExpandedChange = { isSearchExpanded = it },
            searchQuery = searchQuery,
            onSearchQueryChange = { searchQuery = it },
            onCreateNew = onCreateNew,
            onAvatarClick = onAvatarClick,
            surfaceColor = surfaceColor
        )

        if (filteredData.isEmpty()) {
            if (searchQuery.text.isNotBlank()) {
                SearchEmptyState()
            } else {
                EmptyState()
            }
        } else {
            val indexedData = remember(filteredData) {
                filteredData.mapIndexed { index, item -> index to item }
            }
            val listState = rememberLazyListState()
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                items(
                    items = indexedData,
                    key = { (index, item) -> "${item.id}_$index" },
                    contentType = { "session_item" }
                ) { (index, item) ->
                    SwipeToDismissSessionItem(
                        item = item,
                        isSelected = item.id == currentSessionId,
                        onClick = { onSelect(item.id) },
                        onDelete = { onDelete(item.id) }
                    )
                }
            }
        }
    }
}

/**
 * 预计算的会话显示数据
 */
private data class SessionDisplayData(
    val id: String,
    val title: String,
    val previewText: String,
    val timeText: String,
    val iconType: IconType,
    val iconBgColor: Color,
    val isRunning: Boolean = false
)

/**
 * 会话图标类型枚举
 */
private enum class IconType {
    AGENT,      // AI 相关
    CODE,       // 代码/开发相关
    CHART,      // 数据/分析相关
    FILE,       // 文件相关
    UPLOAD,     // 上传/下载相关
    DEFAULT     // 默认图标
}

/**
 * 顶部栏（含搜索功能和新建会话按钮）
 */
@Composable
private fun TopAppBarWithSearch(
    isSearchExpanded: Boolean,
    onSearchExpandedChange: (Boolean) -> Unit,
    searchQuery: TextFieldValue,
    onSearchQueryChange: (TextFieldValue) -> Unit,
    onCreateNew: () -> Unit,
    onAvatarClick: () -> Unit,
    surfaceColor: Color
) {
    val onSurfaceColor = MaterialTheme.colorScheme.onSurface
    val onSurfaceVariantColor = MaterialTheme.colorScheme.onSurfaceVariant
    val surfaceVariantColor = MaterialTheme.colorScheme.surfaceVariant

    Column(
        modifier = Modifier
            .background(surfaceColor)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(surfaceVariantColor)
                    .clickable(onClick = onAvatarClick),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "U",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = onSurfaceVariantColor
                )
            }

            Text(
                text = "收藏家",
                fontSize = 22.sp,
                color = onSurfaceColor,
                letterSpacing = 0.5.sp
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        onSearchExpandedChange(!isSearchExpanded)
                        if (isSearchExpanded) {
                            onSearchQueryChange(TextFieldValue(""))
                        }
                    },
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = if (isSearchExpanded) Icons.Default.Close else Icons.Default.Search,
                        contentDescription = if (isSearchExpanded) "关闭搜索" else "搜索",
                        tint = onSurfaceColor,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(onSurfaceColor)
                        .clickable(onClick = onCreateNew),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "新建会话",
                        tint = surfaceColor,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        AnimatedVisibility(
            visible = isSearchExpanded,
            enter = fadeIn() + androidx.compose.animation.expandVertically(),
            exit = fadeOut() + androidx.compose.animation.shrinkVertically()
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                placeholder = {
                    Text("搜索会话...", color = onSurfaceVariantColor, fontSize = 14.sp)
                },
                singleLine = true,
                shape = RoundedCornerShape(20.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = surfaceVariantColor,
                    unfocusedContainerColor = surfaceVariantColor,
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent,
                    cursorColor = MaterialTheme.colorScheme.primary,
                    focusedTextColor = onSurfaceColor,
                    unfocusedTextColor = onSurfaceColor
                )
            )
        }
    }
}

/**
 * 滑动删除的会话列表项
 * 包含删除确认对话框，防止误删
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToDismissSessionItem(
    item: SessionDisplayData,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    // 删除确认对话框显示状态
    var showDeleteConfirmDialog by remember { mutableStateOf(false) }
    // 标记是否需要执行删除（用户已确认）
    var confirmedDelete by remember { mutableStateOf(false) }

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { dismissValue ->
            if (dismissValue == SwipeToDismissBoxValue.EndToStart) {
                // 滑动时显示确认对话框，而不是直接删除
                showDeleteConfirmDialog = true
                false // 暂时不执行删除，等待用户确认
            } else {
                false
            }
        },
        positionalThreshold = { totalDistance -> totalDistance * 0.4f }
    )

    // 用户确认删除后执行删除操作
    LaunchedEffect(confirmedDelete) {
        if (confirmedDelete) {
            onDelete()
            confirmedDelete = false
        }
    }

    // 删除确认对话框
    if (showDeleteConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = false },
            title = { Text("删除会话") },
            text = { Text("确定要删除会话"${item.title}"吗？此操作不可撤销。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirmDialog = false
                        confirmedDelete = true
                    }
                ) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmDialog = false }) {
                    Text("取消")
                }
            }
        )
    }

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val color = if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart) {
                MaterialTheme.colorScheme.error
            } else {
                Color.Transparent
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(color)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "删除",
                    tint = Color.White
                )
            }
        },
        enableDismissFromStartToEnd = false
    ) {
        SessionItem(
            item = item,
            isSelected = isSelected,
            onClick = onClick
        )
    }
}

/**
 * 会话列表项 - 显示标题、最新消息摘要和AI运行状态
 */
@Composable
private fun SessionItem(
    item: SessionDisplayData,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val itemBgColor = if (isSelected) {
        MaterialTheme.colorScheme.surfaceVariant
    } else {
        MaterialTheme.colorScheme.surface
    }
    val onSurfaceColor = MaterialTheme.colorScheme.onSurface
    val onSurfaceVariantColor = MaterialTheme.colorScheme.onSurfaceVariant

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .background(itemBgColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 左侧图标（带运行状态指示器）
        Box(
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(item.iconBgColor),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = getIconForType(item.iconType),
                    contentDescription = null,
                    tint = onSurfaceVariantColor,
                    modifier = Modifier.size(20.dp)
                )
            }

            // AI运行状态转圈动画
            if (item.isRunning) {
                RunningIndicator()
            }
        }

        // 中间内容区域
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp)
                .fillMaxHeight(),
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = item.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = onSurfaceColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = item.previewText,
                fontSize = 13.sp,
                color = onSurfaceVariantColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        // 右侧时间
        Text(
            text = item.timeText,
            fontSize = 12.sp,
            color = onSurfaceVariantColor
        )
    }
}

/**
 * AI运行状态指示器 - 在图标外圈显示旋转动画
 */
@Composable
private fun RunningIndicator() {
    val infiniteTransition = rememberInfiniteTransition(label = "running")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    Box(
        modifier = Modifier
            .size(46.dp)
            .rotate(rotation),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 2.dp,
            trackColor = Color.Transparent
        )
    }
}

/**
 * 获取图标类型
 */
private fun getIconType(title: String): IconType {
    return when {
        title.contains("Agent", ignoreCase = true) -> IconType.AGENT
        title.contains("代码", ignoreCase = true) ||
        title.contains("开发", ignoreCase = true) -> IconType.CODE
        title.contains("分析", ignoreCase = true) ||
        title.contains("数据", ignoreCase = true) -> IconType.CHART
        title.contains("文件", ignoreCase = true) -> IconType.FILE
        title.contains("上传", ignoreCase = true) ||
        title.contains("下载", ignoreCase = true) -> IconType.UPLOAD
        else -> IconType.DEFAULT
    }
}

/**
 * 根据图标类型获取对应的 ImageVector
 */
private fun getIconForType(iconType: IconType): ImageVector {
    return when (iconType) {
        IconType.AGENT -> Icons.Filled.AutoAwesome
        IconType.CODE -> Icons.Filled.Code
        IconType.CHART -> Icons.Filled.InsertChart
        IconType.FILE -> Icons.Filled.Description
        IconType.UPLOAD -> Icons.AutoMirrored.Filled.Chat
        IconType.DEFAULT -> Icons.Filled.SmartToy
    }
}

/**
 * 获取图标背景色（适配暗色主题）
 */
private fun getIconBgColor(title: String, isDark: Boolean): Color {
    return if (isDark) {
        when {
            title.contains("Agent", ignoreCase = true) -> Color(0xFF2D1B69)
            title.contains("代码", ignoreCase = true) ||
            title.contains("开发", ignoreCase = true) -> Color(0xFF1B3A5C)
            title.contains("分析", ignoreCase = true) ||
            title.contains("数据", ignoreCase = true) -> Color(0xFF5C3A1B)
            title.contains("测试", ignoreCase = true) -> Color(0xFF1B5C2D)
            title.contains("文件", ignoreCase = true) -> Color(0xFF5C4F1B)
            else -> Color(0xFF2D2D3A)
        }
    } else {
        when {
            title.contains("Agent", ignoreCase = true) -> Color(0xFFF0E6FF)
            title.contains("代码", ignoreCase = true) ||
            title.contains("开发", ignoreCase = true) -> Color(0xFFE6F3FF)
            title.contains("分析", ignoreCase = true) ||
            title.contains("数据", ignoreCase = true) -> Color(0xFFFFF0E6)
            title.contains("测试", ignoreCase = true) -> Color(0xFFE6FFE6)
            title.contains("文件", ignoreCase = true) -> Color(0xFFFFF8E6)
            else -> Color(0xFFF0F0F0)
        }
    }
}

/**
 * 生成预览文本 - 根据标题关键词生成更丰富的预览内容
 */
private fun generatePreview(title: String): String {
    return when {
        title.contains("Agent", ignoreCase = true) ||
        title.contains("AI", ignoreCase = true) -> "让我来帮您分析这个问题并提供最佳解决方案..."
        title.contains("代码", ignoreCase = true) ||
        title.contains("开发", ignoreCase = true) ||
        title.contains("编程", ignoreCase = true) -> "好的，我来为您编写高效的代码实现这个功能..."
        title.contains("文件", ignoreCase = true) ||
        title.contains("文档", ignoreCase = true) -> "Manus 将在您回复后继续处理文件任务..."
        title.contains("提取", ignoreCase = true) ||
        title.contains("转换", ignoreCase = true) -> "我已经为您从数据中提取并整理了关键信息..."
        title.contains("分析", ignoreCase = true) ||
        title.contains("调研", ignoreCase = true) -> "让我先深入分析这个问题，然后给出详细报告..."
        title.contains("数据", ignoreCase = true) ||
        title.contains("统计", ignoreCase = true) -> "我已经完成了对数据的深度统计分析..."
        title.contains("测试", ignoreCase = true) -> "测试用例已生成，正在进行自动化测试..."
        title.contains("GitHub", ignoreCase = true) ||
        title.contains("仓库", ignoreCase = true) -> "已成功连接到 GitHub，正在获取仓库信息..."
        title.contains("趋势", ignoreCase = true) ||
        title.contains("研究", ignoreCase = true) -> "我已完成对专业趋势的深度调研分析..."
        title.contains("上传", ignoreCase = true) -> "文件上传成功，正在进行处理和分析..."
        title.contains("下载", ignoreCase = true) -> "文件已准备就绪，正在为您打包下载..."
        title.contains("搜索", ignoreCase = true) ||
        title.contains("查找", ignoreCase = true) -> "正在为您搜索相关信息，请稍候..."
        title.contains("解释", ignoreCase = true) ||
        title.contains("说明", ignoreCase = true) -> "让我来详细解释这个概念和原理..."
        title.contains("优化", ignoreCase = true) -> "检测到优化空间，正在调整参数以提升性能..."
        title.contains("创建", ignoreCase = true) ||
        title.contains("新建", ignoreCase = true) -> "正在为您创建，请稍等片刻..."
        title.contains("删除", ignoreCase = true) ||
        title.contains("移除", ignoreCase = true) -> "已确认删除操作，正在执行..."
        else -> "点击继续这段对话..."
    }
}

private val UTC_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).apply {
    timeZone = TimeZone.getTimeZone("UTC")
}
private val TIME_FMT = SimpleDateFormat("HH:mm", Locale.getDefault())
private val DATE_FMT = SimpleDateFormat("M/d", Locale.getDefault())
private val YEAR_FMT = SimpleDateFormat("yyyy/M/d", Locale.getDefault())

/**
 * 格式化时间
 */
private fun formatTime(dateStr: String): String {
    if (dateStr.isEmpty()) return ""
    return try {
        val date = UTC_FORMAT.parse(dateStr) ?: return ""
        val now = Calendar.getInstance()
        val cal = Calendar.getInstance().apply { time = date }

        when {
            now.get(Calendar.YEAR) == cal.get(Calendar.YEAR) &&
            now.get(Calendar.DAY_OF_YEAR) == cal.get(Calendar.DAY_OF_YEAR) -> TIME_FMT.format(date)
            now.get(Calendar.YEAR) == cal.get(Calendar.YEAR) -> DATE_FMT.format(date)
            else -> YEAR_FMT.format(date)
        }
    } catch (_: Exception) {
        ""
    }
}

/**
 * 空状态
 */
@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "还没有会话",
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "点击右下角开始新对话",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
            )
        }
    }
}

/**
 * 搜索无结果状态
 */
@Composable
private fun SearchEmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "未找到匹配的会话",
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "尝试其他关键词",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
            )
        }
    }
}
