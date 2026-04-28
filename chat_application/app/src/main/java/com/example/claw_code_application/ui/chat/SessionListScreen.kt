package com.example.claw_code_application.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionListScreen(
    sessions: List<Session>,
    currentSessionId: String?,
    onSelect: (String) -> Unit,
    onCreateNew: () -> Unit,
    onDelete: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("全部", "Agent", "手动", "已定时", "收藏")
    var isSearchExpanded by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf(TextFieldValue("")) }

    val isDarkTheme = !isSystemInDarkTheme().not()

    val sessionDisplayData = remember(sessions) {
        sessions.map { session ->
            SessionDisplayData(
                id = session.id,
                title = session.title.ifEmpty { "新对话" },
                previewText = generatePreview(session.title),
                timeText = formatTime(session.updatedAt),
                iconText = getIconText(session.title),
                iconBgColor = getIconBgColor(session.title, isDarkTheme)
            )
        }
    }

    val filteredData = remember(sessionDisplayData, searchQuery) {
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
            surfaceColor = surfaceColor
        )

        TabRow(
            tabs = tabs,
            selectedTab = selectedTab,
            onTabSelected = { selectedTab = it }
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
            LazyColumn(
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                items(
                    items = indexedData,
                    // 使用 index 辅助确保 key 唯一性，防止重复 ID 导致崩溃
                    key = { (index, item) -> "${item.id}_$index" }
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
    val iconText: String,
    val iconBgColor: androidx.compose.ui.graphics.Color
)

/**
 * 顶部栏（含搜索功能）
 */
@Composable
private fun TopAppBarWithSearch(
    isSearchExpanded: Boolean,
    onSearchExpandedChange: (Boolean) -> Unit,
    searchQuery: TextFieldValue,
    onSearchQueryChange: (TextFieldValue) -> Unit,
    surfaceColor: androidx.compose.ui.graphics.Color
) {
    val onSurfaceColor = MaterialTheme.colorScheme.onSurface
    val onSurfaceVariantColor = MaterialTheme.colorScheme.onSurfaceVariant
    val surfaceVariantColor = MaterialTheme.colorScheme.surfaceVariant

    Column(modifier = Modifier.background(surfaceColor)) {
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
                    .background(surfaceVariantColor),
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
                    focusedBorderColor = androidx.compose.ui.graphics.Color.Transparent,
                    unfocusedBorderColor = androidx.compose.ui.graphics.Color.Transparent,
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
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToDismissSessionItem(
    item: SessionDisplayData,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { dismissValue ->
            if (dismissValue == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                true
            } else {
                false
            }
        },
        positionalThreshold = { totalDistance -> totalDistance * 0.4f }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val color = if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart) {
                MaterialTheme.colorScheme.error
            } else {
                androidx.compose.ui.graphics.Color.Transparent
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
                    tint = androidx.compose.ui.graphics.Color.White
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
 * 标签栏
 */
@Composable
private fun TabRow(
    tabs: List<String>,
    selectedTab: Int,
    onTabSelected: (Int) -> Unit
) {
    val surfaceColor = MaterialTheme.colorScheme.surface

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(surfaceColor)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        tabs.forEachIndexed { index, tab ->
            val selected = index == selectedTab
            TabItem(
                text = tab,
                selected = selected,
                onClick = { onTabSelected(index) }
            )
        }
    }
}

@Composable
private fun TabItem(text: String, selected: Boolean, onClick: () -> Unit) {
    val bgColor = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (selected) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.onSurfaceVariant

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bgColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        Text(
            text = text,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
            color = textColor
        )
    }
}

/**
 * 会话列表项
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

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(68.dp)
            .background(itemBgColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp)
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .size(40.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(item.iconBgColor),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = item.iconText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = onSurfaceVariantColor
            )
        }

        Text(
            text = item.timeText,
            fontSize = 12.sp,
            color = onSurfaceVariantColor,
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 14.dp)
        )

        Text(
            text = item.title,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = onSurfaceColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .padding(start = 52.dp, top = 12.dp, end = 50.dp)
                .fillMaxWidth()
        )

        Text(
            text = item.previewText,
            fontSize = 13.sp,
            color = onSurfaceVariantColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .padding(start = 52.dp, top = 36.dp, end = 16.dp)
                .fillMaxWidth()
        )
    }
}

/**
 * 获取图标文本
 */
private fun getIconText(title: String): String {
    return when {
        title.contains("Agent", ignoreCase = true) -> "Ai"
        title.contains("代码", ignoreCase = true) ||
        title.contains("开发", ignoreCase = true) -> "{ }"
        title.contains("分析", ignoreCase = true) ||
        title.contains("数据", ignoreCase = true) -> "#"
        title.contains("测试", ignoreCase = true) -> "T"
        title.contains("文件", ignoreCase = true) -> "F"
        title.contains("上传", ignoreCase = true) ||
        title.contains("下载", ignoreCase = true) -> "↑"
        else -> "M"
    }
}

/**
 * 获取图标背景色（适配暗色主题）
 */
private fun getIconBgColor(title: String, isDark: Boolean): androidx.compose.ui.graphics.Color {
    return if (isDark) {
        when {
            title.contains("Agent", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFF2D1B69)
            title.contains("代码", ignoreCase = true) ||
            title.contains("开发", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFF1B3A5C)
            title.contains("分析", ignoreCase = true) ||
            title.contains("数据", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFF5C3A1B)
            title.contains("测试", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFF1B5C2D)
            title.contains("文件", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFF5C4F1B)
            else -> androidx.compose.ui.graphics.Color(0xFF2D2D3A)
        }
    } else {
        when {
            title.contains("Agent", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFFF0E6FF)
            title.contains("代码", ignoreCase = true) ||
            title.contains("开发", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFFE6F3FF)
            title.contains("分析", ignoreCase = true) ||
            title.contains("数据", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFFFFF0E6)
            title.contains("测试", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFFE6FFE6)
            title.contains("文件", ignoreCase = true) -> androidx.compose.ui.graphics.Color(0xFFFFF8E6)
            else -> androidx.compose.ui.graphics.Color(0xFFF0F0F0)
        }
    }
}

/**
 * 生成预览文本
 */
private fun generatePreview(title: String): String {
    return when {
        title.contains("文件", ignoreCase = true) -> "Manus 将在您回复后继续工作"
        title.contains("提取", ignoreCase = true) ||
        title.contains("转换", ignoreCase = true) -> "我已经为您从 Excel 文件中提取并整理了数据..."
        title.contains("探索", ignoreCase = true) ||
        title.contains("检查", ignoreCase = true) -> "当前系统中正在运行的主要进程包括..."
        title.contains("分析", ignoreCase = true) -> "好的，我这就为您检查项目中的进度..."
        title.contains("GitHub", ignoreCase = true) -> "抱歉，刚才我应该直接把分析结果展示给您..."
        title.contains("趋势", ignoreCase = true) ||
        title.contains("研究", ignoreCase = true) -> "我已完成对专业趋势的深度调研..."
        title.contains("习惯", ignoreCase = true) -> "这是关于大多数人手机使用习惯的研究报告..."
        title.contains("做什么", ignoreCase = true) -> "你好！我是 Manus，一个能够处理各种复杂任务..."
        title.contains("投资", ignoreCase = true) ||
        title.contains("组合", ignoreCase = true) -> "很好！项目已经成功初始化，开发服务器正在运..."
        else -> "点击继续对话..."
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
