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
