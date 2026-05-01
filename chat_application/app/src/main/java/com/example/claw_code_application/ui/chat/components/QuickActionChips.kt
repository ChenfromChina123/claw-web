package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 快捷操作提示词模板
 */
private data class QuickAction(
    val icon: String,
    val label: String,
    val prompt: String,
    val color: Color
)

/**
 * 新对话快捷操作芯片
 *
 * 在新对话（消息为空）时显示在输入框上方，
 * 提供预设提示词模板，用户点击即可直接发送给 Agent。
 */
@Composable
fun QuickActionChips(
    onActionClick: (String) -> Unit
) {
    val colors = AppColor.current

    val actions = listOf(
        QuickAction(
            icon = "🌐",
            label = "发布网站",
            prompt = "请帮我将当前工作区的项目发布为网站，部署后告诉我预览地址。",
            color = Color(0xFF60A5FA)
        ),
        QuickAction(
            icon = "💻",
            label = "开发应用",
            prompt = "请帮我创建一个新的 Web 应用项目，包含基础框架和开发服务器，然后发布预览。",
            color = Color(0xFFA78BFA)
        ),
        QuickAction(
            icon = "📊",
            label = "数据分析",
            prompt = "请帮我分析当前工作区的数据文件，生成可视化报告并发布为网页。",
            color = Color(0xFF4ADE80)
        ),
        QuickAction(
            icon = "🔧",
            label = "修复问题",
            prompt = "请检查当前项目的代码，修复存在的问题，确保项目可以正常运行。",
            color = Color(0xFFFBBF24)
        )
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        actions.forEach { action ->
            QuickActionChip(
                action = action,
                onClick = { onActionClick(action.prompt) }
            )
        }
    }
}

/**
 * 单个快捷操作芯片
 */
@Composable
private fun QuickActionChip(
    action: QuickAction,
    onClick: () -> Unit
) {
    val colors = AppColor.current

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(action.color.copy(alpha = 0.08f))
            .border(0.5.dp, action.color.copy(alpha = 0.25f), RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(text = action.icon, fontSize = 13.sp)
        Text(
            text = action.label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = action.color
        )
    }
}
