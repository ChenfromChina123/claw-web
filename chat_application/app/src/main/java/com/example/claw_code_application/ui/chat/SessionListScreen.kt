package com.example.claw_code_application.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.Session
import java.text.SimpleDateFormat
import java.util.*

/**
 * 会话列表界面 - Manus 风格设计（极致性能优化版）
 * 关键优化：
 * 1. 预计算所有显示数据
 * 2. 使用纯文本替代 emoji（emoji 渲染开销大）
 * 3. 减少布局嵌套层级
 * 4. 固定列表项高度
 * 5. 使用 contentType 优化 LazyColumn 复用
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
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("全部", "Agent", "手动", "已定时", "收藏")

    // 预计算所有显示数据，只在 sessions 变化时计算一次
    val sessionDisplayData = remember(sessions) {
        sessions.map { session ->
            SessionDisplayData(
                id = session.id,
                title = session.title.ifEmpty { "新对话" },
                previewText = generatePreview(session.title),
                timeText = formatTime(session.updatedAt),
                iconText = getIconText(session.title),
                iconBgColor = getIconBgColor(session.title)
            )
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F5))
    ) {
        // 顶部标题栏
        TopAppBar()

        // 分类标签栏
        TabRow(
            tabs = tabs,
            selectedTab = selectedTab,
            onTabSelected = { selectedTab = it }
        )

        // 会话列表
        if (sessionDisplayData.isEmpty()) {
            EmptyState()
        } else {
            LazyColumn(
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                items(
                    items = sessionDisplayData,
                    key = { it.id },
                    contentType = { "session_item" }
                ) { item ->
                    SessionItem(
                        item = item,
                        isSelected = item.id == currentSessionId,
                        onClick = { onSelect(item.id) }
                    )
                }
            }
        }
    }
}

/**
 * 预计算的会话显示数据 - 纯数据类，无 Compose 依赖
 */
private data class SessionDisplayData(
    val id: String,
    val title: String,
    val previewText: String,
    val timeText: String,
    val iconText: String,
    val iconBgColor: Color
)

// ==================== 顶部栏 ====================

@Composable
private fun TopAppBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 用户头像
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Color(0xFFE0E0E0)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "U",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF757575)
            )
        }

        Text(
            text = "收藏家",
            fontSize = 22.sp,
            color = Color.Black,
            letterSpacing = 0.5.sp
        )

        IconButton(onClick = { }, modifier = Modifier.size(40.dp)) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = null,
                tint = Color(0xFF333333),
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

// ==================== 标签栏 ====================

@Composable
private fun TabRow(
    tabs: List<String>,
    selectedTab: Int,
    onTabSelected: (Int) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
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
    val bgColor = if (selected) Color(0xFF1A1A1A) else Color(0xFFF0F0F0)
    val textColor = if (selected) Color.White else Color(0xFF666666)

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

// ==================== 列表项 ====================

/**
 * 会话列表项 - 极致简化布局
 * 使用固定高度，减少嵌套，避免使用 Column/Row 嵌套
 */
@Composable
private fun SessionItem(
    item: SessionDisplayData,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(68.dp)
            .background(if (isSelected) Color(0xFFF0F0F0) else Color.White)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp)
    ) {
        // 使用绝对定位减少嵌套
        // 左侧图标
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
                color = Color(0xFF555555)
            )
        }

        // 右侧时间
        Text(
            text = item.timeText,
            fontSize = 12.sp,
            color = Color(0xFF999999),
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 14.dp)
        )

        // 标题 - 位于图标右侧
        Text(
            text = item.title,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF1A1A1A),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .padding(start = 52.dp, top = 12.dp, end = 50.dp)
                .fillMaxWidth()
        )

        // 预览文本 - 位于标题下方
        Text(
            text = item.previewText,
            fontSize = 13.sp,
            color = Color(0xFF888888),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .padding(start = 52.dp, top = 36.dp, end = 16.dp)
                .fillMaxWidth()
        )
    }
}

// ==================== 预计算函数 ====================

/**
 * 获取图标文本 - 使用纯文本替代 emoji
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
 * 获取图标背景色
 */
private fun getIconBgColor(title: String): Color {
    return when {
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

// 静态日期格式化实例
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

// ==================== 空状态 ====================

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
                color = Color(0xFF999999)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "点击右下角开始新对话",
                fontSize = 14.sp,
                color = Color(0xFFBBBBBB)
            )
        }
    }
}
