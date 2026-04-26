package com.example.claw_code_application.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
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
import com.example.claw_code_application.ui.theme.AppColor
import java.text.SimpleDateFormat
import java.util.*

/**
 * 会话列表界面 - Manus 风格设计
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
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("全部", "Agent", "手动", "已定时", "收藏")

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F5))
    ) {
        // 顶部标题栏
        TopAppBarSection(onCreateNew = onCreateNew)

        // 分类标签栏
        TabRowSection(
            tabs = tabs,
            selectedTab = selectedTab,
            onTabSelected = { selectedTab = it }
        )

        // 会话列表
        if (sessions.isEmpty()) {
            EmptyState(onCreateNew = onCreateNew)
        } else {
            LazyColumn(
                contentPadding = PaddingValues(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                items(sessions, key = { it.id }) { session ->
                    ManusSessionItem(
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
 * 顶部应用栏 - Manus 风格
 * 包含用户头像、标题、搜索按钮
 */
@Composable
private fun TopAppBarSection(onCreateNew: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // 第一行：头像 + 标题 + 搜索
        Row(
            modifier = Modifier.fillMaxWidth(),
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
                onClick = { /* TODO: 搜索功能 */ },
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
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = if (isSelected) Color(0xFF1A1A1A) else Color(0xFFF0F0F0),
                modifier = Modifier.clickable { onTabSelected(index) }
            ) {
                Text(
                    text = tab,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                    color = if (isSelected) Color.White else Color(0xFF666666),
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                )
            }
        }
    }
}

/**
 * Manus 风格会话列表项
 * 包含：图标、标题、描述/摘要、时间
 */
@Composable
private fun ManusSessionItem(
    session: Session,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isSelected) Color(0xFFF0F0F0) else Color.White)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 左侧图标
        SessionIcon(session = session)

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
                    text = session.title.ifEmpty { "新对话" },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF1A1A1A),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                // 时间
                Text(
                    text = formatManusTime(session.updatedAt),
                    fontSize = 12.sp,
                    color = Color(0xFF999999)
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // 描述/摘要（模拟内容预览）
            Text(
                text = generateSessionPreview(session),
                fontSize = 13.sp,
                color = Color(0xFF888888),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * 会话图标 - 根据会话类型显示不同图标
 */
@Composable
private fun SessionIcon(session: Session) {
    // 根据标题内容判断类型，显示不同图标
    val (iconChar, bgColor) = when {
        session.title.contains("Agent", ignoreCase = true) ->
            "A" to Color(0xFFF0E6FF)
        session.title.contains("代码", ignoreCase = true) ||
        session.title.contains("开发", ignoreCase = true) ->
            "</>" to Color(0xFFE6F3FF)
        session.title.contains("分析", ignoreCase = true) ||
        session.title.contains("数据", ignoreCase = true) ->
            "📊" to Color(0xFFFFF0E6)
        session.title.contains("测试", ignoreCase = true) ->
            "🧪" to Color(0xFFE6FFE6)
        else ->
            "💬" to Color(0xFFF0F0F0)
    }

    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = iconChar,
            fontSize = if (iconChar.length > 1) 12.sp else 18.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF666666)
        )
    }
}

/**
 * 生成会话预览文本
 * 基于会话标题生成模拟的预览内容
 */
private fun generateSessionPreview(session: Session): String {
    return when {
        session.title.contains("文件", ignoreCase = true) ->
            "Manus 将在您回复后继续工作"
        session.title.contains("提取", ignoreCase = true) ||
        session.title.contains("转换", ignoreCase = true) ->
            "我已经为您从 Excel 文件中提取并整理了数据..."
        session.title.contains("探索", ignoreCase = true) ||
        session.title.contains("检查", ignoreCase = true) ->
            "当前系统中正在运行的主要进程包括：| 进程名称..."
        session.title.contains("分析", ignoreCase = true) ->
            "好的，我这就为您检查项目中的进度..."
        session.title.contains("GitHub", ignoreCase = true) ->
            "抱歉，刚才我应该直接把分析结果展示给您。根..."
        session.title.contains("趋势", ignoreCase = true) ||
        session.title.contains("研究", ignoreCase = true) ->
            "我已完成对专业趋势的深度调研。通..."
        session.title.contains("习惯", ignoreCase = true) ->
            "这是关于大多数人手机使用习惯的研究报告，其..."
        session.title.contains("做什么", ignoreCase = true) ->
            "你好！我是 Manus，一个能够处理各种复杂任务..."
        session.title.contains("投资", ignoreCase = true) ||
        session.title.contains("组合", ignoreCase = true) ->
            "很好！项目已经成功初始化，开发服务器正在运..."
        else -> "点击继续对话..."
    }
}

/**
 * 空状态 - Manus 风格
 */
@Composable
private fun EmptyState(onCreateNew: () -> Unit) {
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

/**
 * 格式化为 Manus 风格的时间显示
 * 今天显示时间，其他显示日期
 */
private fun formatManusTime(dateStr: String): String {
    return try {
        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.parse(dateStr) ?: return ""

        val now = Calendar.getInstance()
        val dateCal = Calendar.getInstance().apply { time = date }

        // 转换为本地时间
        val localFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
        val dateFormat = SimpleDateFormat("M/d", Locale.getDefault())
        val yearFormat = SimpleDateFormat("yyyy/M/d", Locale.getDefault())

        when {
            // 今天 - 显示时间
            now.get(Calendar.YEAR) == dateCal.get(Calendar.YEAR) &&
            now.get(Calendar.DAY_OF_YEAR) == dateCal.get(Calendar.DAY_OF_YEAR) -> {
                localFormat.format(date)
            }
            // 今年 - 显示月/日
            now.get(Calendar.YEAR) == dateCal.get(Calendar.YEAR) -> {
                dateFormat.format(date)
            }
            // 其他年份 - 显示年/月/日
            else -> {
                yearFormat.format(date)
            }
        }
    } catch (e: Exception) {
        ""
    }
}
