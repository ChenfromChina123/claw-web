package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.BackgroundTask
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.ui.theme.AppColors

private data class TaskStatusStyle(
    val icon: String,
    val label: String,
    val color: Color,
    val backgroundColor: Color,
    val accentColor: Color
)

/**
 * 根据任务状态获取对应的样式配置
 */
private fun getTaskStatusStyle(status: String, colors: AppColors): TaskStatusStyle {
    return when (status) {
        "created", "queued" -> TaskStatusStyle(
            icon = "○",
            label = "等待中",
            color = colors.TextSecondary,
            backgroundColor = colors.SurfaceVariant,
            accentColor = colors.TextSecondary
        )
        "running" -> TaskStatusStyle(
            icon = "✦",
            label = "执行中",
            color = colors.PrimaryLight,
            backgroundColor = colors.PrimaryLight.copy(alpha = 0.08f),
            accentColor = colors.PrimaryLight
        )
        "completed" -> TaskStatusStyle(
            icon = "✓",
            label = "已完成",
            color = colors.Success,
            backgroundColor = colors.SuccessBackground,
            accentColor = colors.Success
        )
        "failed" -> TaskStatusStyle(
            icon = "✗",
            label = "失败",
            color = colors.Error,
            backgroundColor = colors.ErrorBackground,
            accentColor = colors.Error
        )
        "cancelled" -> TaskStatusStyle(
            icon = "⊘",
            label = "已取消",
            color = colors.TextSecondary,
            backgroundColor = colors.SurfaceVariant,
            accentColor = colors.TextSecondary
        )
        else -> TaskStatusStyle(
            icon = "○",
            label = status,
            color = colors.TextSecondary,
            backgroundColor = colors.SurfaceVariant,
            accentColor = colors.TextSecondary
        )
    }
}

/**
 * 任务容器卡片 - 包裹任务标题和内部操作内容
 *
 * 设计理念：
 * - 左侧竖线标识任务状态色
 * - 任务标题行 + 状态标签
 * - 内容区域缩进24dp，形成IDE风格层级
 * - 支持展开/收起动画
 */
@Composable
fun TaskContainerCard(
    task: BackgroundTask,
    isCollapsed: Boolean,
    onCollapsedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val colors = AppColor.current
    val statusStyle = getTaskStatusStyle(task.status, colors)

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = colors.SurfaceVariant
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, colors.Border)
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .fillMaxHeight()
                    .background(statusStyle.accentColor)
            )

            Column(modifier = Modifier.weight(1f)) {
                TaskHeaderRow(
                    taskName = task.taskName,
                    statusStyle = statusStyle,
                    isRunning = task.status == "running",
                    isCollapsed = isCollapsed,
                    onCollapsedChange = onCollapsedChange
                )

                AnimatedVisibility(
                    visible = !isCollapsed,
                    enter = expandVertically(
                        animationSpec = tween(250, easing = FastOutSlowInEasing)
                    ) + fadeIn(animationSpec = tween(200)),
                    exit = shrinkVertically(
                        animationSpec = tween(200, easing = FastOutSlowInEasing)
                    ) + fadeOut(animationSpec = tween(150))
                ) {
                    Column(
                        modifier = Modifier
                            .padding(start = 24.dp, end = 12.dp, bottom = 12.dp)
                    ) {
                        content()
                    }
                }
            }
        }
    }
}

/**
 * 任务标题行 - 状态图标 + 任务名 + 状态标签 + 展开/收起
 */
@Composable
private fun TaskHeaderRow(
    taskName: String,
    statusStyle: TaskStatusStyle,
    isRunning: Boolean,
    isCollapsed: Boolean,
    onCollapsedChange: (Boolean) -> Unit
) {
    val colors = AppColor.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCollapsedChange(!isCollapsed) }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (isRunning) {
            val infiniteTransition = rememberInfiniteTransition(label = "task_pulse")
            val alpha by infiniteTransition.animateFloat(
                initialValue = 1f,
                targetValue = 0.4f,
                animationSpec = infiniteRepeatable(
                    animation = tween(800, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "task_pulse_alpha"
            )
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .background(
                        color = statusStyle.color.copy(alpha = alpha * 0.15f),
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = statusStyle.icon,
                    fontSize = 11.sp,
                    color = statusStyle.color
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .background(
                        color = statusStyle.backgroundColor,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = statusStyle.icon,
                    fontSize = 11.sp,
                    color = statusStyle.color
                )
            }
        }

        Text(
            text = taskName,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = colors.TextPrimary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )

        Surface(
            shape = RoundedCornerShape(4.dp),
            color = statusStyle.backgroundColor,
            border = BorderStroke(1.dp, statusStyle.color.copy(alpha = 0.2f))
        ) {
            Text(
                text = statusStyle.label,
                fontSize = 11.sp,
                color = statusStyle.color,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }

        Text(
            text = if (isCollapsed) "展开" else "收起",
            fontSize = 12.sp,
            color = colors.TextSecondary
        )
    }
}
