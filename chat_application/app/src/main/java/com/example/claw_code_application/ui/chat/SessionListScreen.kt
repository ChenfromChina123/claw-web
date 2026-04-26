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
 * 会话列表界面 - Manus 风格设计（性能优化版）
 * 顶部搜索栏 + 分类标签 + 列表项（带图标、描述、时间）
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

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F5))
    ) {
        // 顶部标题栏
        TopAppBarSection()

        // 分类标签栏
        TabRowSection(
            tabs = tabs,
            selectedTab = selectedTab,
            onTabSelected = { selectedTab = it }
        )

        // 会话列表
        if (sessions.isEmpty()) {
            EmptyState()
        } else {
            // 预计算所有会话的显示数据，避免在列表滑动时重复计算
            val sessionDisplayData = remember(sessions) {
                sessions.map { session ->
                    SessionDisplayData(
                        session = session,
                        previewText = generateSessionPreviewInternal(session.title),
                        timeText = formatManusTimeInternal(session.updatedAt),
                        iconInfo = getIconInfoInternal(session.title)
                    )
                }
            }

            LazyColumn(
                contentPadding = PaddingValues(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                items(
                    items = sessionDisplayData,
                    key = { it.session.id }
                ) { displayData ->
                    ManusSessionItem(
                        displayData = displayData,
                        isSelected = displayData.session.id == currentSessionId,
                        onClick = { onSelect(displayData.session.id) }
                    )
                }
            }
        }
    }
}

/**
 * 预计算的会话显示数据
 * 避免在滑动过程中进行复杂计算
 */
private data class SessionDisplayData(
    val session: Session,
    val previewText: String,
    val timeText: String,
    val iconInfo: IconInfo
)

/**
 * 图标信息
 */
private data class IconInfo(
    val text: String,
    val bgColor: Color
)

/**
 * 顶部应用栏 - Manus 风格
 */
@Composable
private fun TopAppBarSection() {
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

        // 标题
        Text(
            text = "manus",
            fontSize = 22.sp,
            fontWeight = FontWeight.Normal,
            color = Color.Black,
            letterSpacing = 0.5.sp
        )

        // 搜索按钮
        IconButton(
            onClick = { },
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = "搜索",
                tint = Color(0xFF333333),
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

/**
 * 分类标签栏 - 圆角胶囊样式
 */
@Composable
private fun TabRowSection(
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
            val isSelected = index == selectedTab
            val bgColor = if (isSelected) Color(0xFF1A1A1A) else Color(0xFFF0F0F0)
            val textColor = if (isSelected) Color.White else Color(0xFF666666)

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(bgColor)
                    .clickable { onTabSelected(index) }
                    .padding(horizontal = 14.dp, vertical = 6.dp)
            ) {
                Text(
                    text = tab,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                    color = textColor
                )
            }
        }
    }
}

/**
 * Manus 风格会话列表项 - 优化版
 * 使用预计算数据，避免滑动时重复计算
 */
@Composable
private fun ManusSessionItem(
    displayData: SessionDisplayData,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .background(if (isSelected) Color(0xFFF0F0F0) else Color.White)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 左侧图标 - 使用预计算数据
        SessionIcon(iconInfo = displayData.iconInfo)

        Spacer(modifier = Modifier.width(12.dp))

        // 中间内容区域
        Column(
            modifier = Modifier.weight(1f)
        ) {
            // 标题行
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = displayData.session.title.ifEmpty { "新对话" },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF1A1A1A),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                // 时间 - 使用预计算数据
                Text(
                    text = displayData.timeText,
                    fontSize = 12.sp,
                    color = Color(0xFF999999)
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // 描述/摘要 - 使用预计算数据
            Text(
                text = displayData.previewText,
                fontSize = 13.sp,
                color = Color(0xFF888888),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * 会话图标 - 使用预计算数据
 */
@Composable
private fun SessionIcon(iconInfo: IconInfo) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(iconInfo.bgColor),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = iconInfo.text,
            fontSize = if (iconInfo.text.length > 1) 12.sp else 18.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF666666)
        )
    }
}

// ==================== 预计算函数（在 remember 中调用，避免重组时计算） ====================

/**
 * 获取图标信息 - 内部函数，在 remember 中调用
 */
private fun getIconInfoInternal(title: String): IconInfo {
    return when {
        title.contains("Agent", ignoreCase = true) ->
            IconInfo("A", Color(0xFFF0E6FF))
        title.contains("代码", ignoreCase = true) ||
        title.contains("开发", ignoreCase = true) ->
            IconInfo("</>", Color(0xFFE6F3FF))
        title.contains("分析", ignoreCase = true) ||
        title.contains("数据", ignoreCase = true) ->
            IconInfo("📊", Color(0xFFFFF0E6))
        title.contains("测试", ignoreCase = true) ->
            IconInfo("🧪", Color(0xFFE6FFE6))
        else ->
            IconInfo("💬", Color(0xFFF0F0F0))
    }
}

/**
 * 生成会话预览文本 - 内部函数，在 remember 中调用
 */
private fun generateSessionPreviewInternal(title: String): String {
    return when {
        title.contains("文件", ignoreCase = true) ->
            "Manus 将在您回复后继续工作"
        title.contains("提取", ignoreCase = true) ||
        title.contains("转换", ignoreCase = true) ->
            "我已经为您从 Excel 文件中提取并整理了数据..."
        title.contains("探索", ignoreCase = true) ||
        title.contains("检查", ignoreCase = true) ->
            "当前系统中正在运行的主要进程包括：| 进程名称..."
        title.contains("分析", ignoreCase = true) ->
            "好的，我这就为您检查项目中的进度..."
        title.contains("GitHub", ignoreCase = true) ->
            "抱歉，刚才我应该直接把分析结果展示给您。根..."
        title.contains("趋势", ignoreCase = true) ||
        title.contains("研究", ignoreCase = true) ->
            "我已完成对专业趋势的深度调研。通..."
        title.contains("习惯", ignoreCase = true) ->
            "这是关于大多数人手机使用习惯的研究报告，其..."
        title.contains("做什么", ignoreCase = true) ->
            "你好！我是 Manus，一个能够处理各种复杂任务..."
        title.contains("投资", ignoreCase = true) ||
        title.contains("组合", ignoreCase = true) ->
            "很好！项目已经成功初始化，开发服务器正在运..."
        else -> "点击继续对话..."
    }
}

/**
 * 格式化为 Manus 风格的时间显示 - 内部函数，在 remember 中调用
 * 使用静态 SimpleDateFormat 实例避免重复创建
 */
private fun formatManusTimeInternal(dateStr: String): String {
    if (dateStr.isEmpty()) return ""

    return try {
        val date = UTC_DATE_FORMAT.parse(dateStr) ?: return ""
        val now = Calendar.getInstance()
        val dateCal = Calendar.getInstance().apply { time = date }

        when {
            // 今天 - 显示时间
            now.get(Calendar.YEAR) == dateCal.get(Calendar.YEAR) &&
            now.get(Calendar.DAY_OF_YEAR) == dateCal.get(Calendar.DAY_OF_YEAR) -> {
                TIME_FORMAT.format(date)
            }
            // 今年 - 显示月/日
            now.get(Calendar.YEAR) == dateCal.get(Calendar.YEAR) -> {
                DATE_FORMAT.format(date)
            }
            // 其他年份 - 显示年/月/日
            else -> {
                YEAR_DATE_FORMAT.format(date)
            }
        }
    } catch (e: Exception) {
        ""
    }
}

// 静态日期格式化实例，避免重复创建
private val UTC_DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).apply {
    timeZone = TimeZone.getTimeZone("UTC")
}
private val TIME_FORMAT = SimpleDateFormat("HH:mm", Locale.getDefault())
private val DATE_FORMAT = SimpleDateFormat("M/d", Locale.getDefault())
private val YEAR_DATE_FORMAT = SimpleDateFormat("yyyy/M/d", Locale.getDefault())

/**
 * 空状态 - Manus 风格
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
