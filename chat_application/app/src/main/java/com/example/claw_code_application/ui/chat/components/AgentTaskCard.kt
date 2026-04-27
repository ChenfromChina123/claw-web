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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * Agent任务步骤数据类
 */
data class AgentStep(
    val title: String,
    val status: AgentStepStatus
)

/**
 * Agent步骤状态枚举
 */
enum class AgentStepStatus {
    COMPLETED,
    IN_PROGRESS,
    PENDING
}

/**
 * Agent任务卡片 - Manus风格一体化设计
 * 核心特色：✦任务标题 + 步骤列表(✓/○) + 预览卡片
 * 完全复刻Manus原型的Agent Card布局
 *
 * @param taskTitle 任务标题
 * @param steps 任务步骤列表
 * @param isExpanded 是否展开步骤列表
 * @param onExpandedChange 展开/收起回调
 * @param previewTitle 预览卡片标题（为空则不显示预览卡片）
 * @param previewDescription 预览卡片描述
 * @param previewHeaderTitle 预览卡片标题栏文字
 * @param previewHeaderTime 预览卡片标题栏时间
 * @param onPreviewClick 预览按钮点击回调
 * @param onDashboardClick 仪表盘按钮点击回调
 */
@Composable
fun AgentTaskCard(
    taskTitle: String,
    steps: List<AgentStep>,
    isExpanded: Boolean = true,
    onExpandedChange: (Boolean) -> Unit = {},
    previewTitle: String = "",
    previewDescription: String = "",
    previewHeaderTitle: String = "",
    previewHeaderTime: String = "",
    onPreviewClick: () -> Unit = {},
    onDashboardClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.SurfaceDark
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, AppColor.Border)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            AgentCardHeader(
                title = taskTitle,
                isExpanded = isExpanded,
                onExpandedChange = onExpandedChange
            )

            Spacer(modifier = Modifier.height(12.dp))

            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(
                    animationSpec = tween(250, easing = FastOutSlowInEasing)
                ) + fadeIn(animationSpec = tween(200)),
                exit = shrinkVertically(
                    animationSpec = tween(200, easing = FastOutSlowInEasing)
                ) + fadeOut(animationSpec = tween(150))
            ) {
                Column {
                    AgentStepList(steps = steps)

                    if (previewTitle.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))

                        PreviewCard(
                            title = previewTitle,
                            description = previewDescription,
                            headerTitle = previewHeaderTitle,
                            headerTime = previewHeaderTime,
                            onPreviewClick = onPreviewClick,
                            onDashboardClick = onDashboardClick
                        )
                    }
                }
            }
        }
    }
}

/**
 * Agent卡片头部 - ✦图标 + 任务标题
 */
@Composable
private fun AgentCardHeader(
    title: String,
    isExpanded: Boolean,
    onExpandedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onExpandedChange(!isExpanded) },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = "✦",
            fontSize = 14.sp,
            color = AppColor.TextSecondary
        )

        Text(
            text = title,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = AppColor.TextPrimary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )

        Text(
            text = if (isExpanded) "收起" else "展开",
            fontSize = 12.sp,
            color = AppColor.TextSecondary
        )
    }
}

/**
 * Agent步骤列表
 * Manus风格：简洁的 ✓/○ 圆形图标 + 步骤文字
 */
@Composable
private fun AgentStepList(steps: List<AgentStep>) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        steps.forEachIndexed { index, step ->
            AgentStepItem(
                step = step,
                showConnector = index < steps.size - 1
            )
        }
    }
}

/**
 * 单个步骤项
 * Manus原型风格：
 * - 已完成：灰色 ✓ 圆形图标 + 灰色删除线文字
 * - 进行中：空心 ○ 圆形图标 + 黑色文字 + 脉冲动画
 * - 待执行：空心 ○ 圆形图标 + 灰色文字
 */
@Composable
private fun AgentStepItem(
    step: AgentStep,
    showConnector: Boolean
) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StepIcon(status = step.status)

            Text(
                text = step.title,
                fontSize = 13.sp,
                color = when (step.status) {
                    AgentStepStatus.COMPLETED -> AppColor.TaskCompleted
                    AgentStepStatus.IN_PROGRESS -> AppColor.TextPrimary
                    AgentStepStatus.PENDING -> AppColor.TextSecondary
                },
                fontWeight = if (step.status == AgentStepStatus.IN_PROGRESS)
                    FontWeight.Medium else FontWeight.Normal,
                textDecoration = if (step.status == AgentStepStatus.COMPLETED)
                    TextDecoration.LineThrough else TextDecoration.None,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        if (showConnector) {
            Box(
                modifier = Modifier
                    .padding(start = 7.dp)
                    .width(1.dp)
                    .height(10.dp)
                    .background(
                        color = when (step.status) {
                            AgentStepStatus.COMPLETED -> AppColor.TaskCompleted.copy(alpha = 0.3f)
                            else -> AppColor.Border
                        }
                    )
            )
        }
    }
}

/**
 * 步骤状态图标
 * Manus原型风格：16dp圆形图标
 */
@Composable
private fun StepIcon(status: AgentStepStatus) {
    when (status) {
        AgentStepStatus.COMPLETED -> {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .background(
                        color = AppColor.SurfaceLight,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "✓",
                    fontSize = 10.sp,
                    color = AppColor.TaskCompleted
                )
            }
        }

        AgentStepStatus.IN_PROGRESS -> {
            val infiniteTransition = rememberInfiniteTransition(label = "step_pulse")
            val alpha by infiniteTransition.animateFloat(
                initialValue = 1f,
                targetValue = 0.4f,
                animationSpec = infiniteRepeatable(
                    animation = tween(800, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "step_pulse_alpha"
            )

            Box(
                modifier = Modifier
                    .size(16.dp)
                    .background(
                        color = AppColor.Primary.copy(alpha = alpha * 0.2f),
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .background(
                            color = AppColor.Primary,
                            shape = CircleShape
                        )
                )
            }
        }

        AgentStepStatus.PENDING -> {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .background(
                        color = Color.Transparent,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .background(
                            color = Color.Transparent,
                            shape = CircleShape
                        )
                        .then(
                            Modifier.background(
                                color = Color.Transparent,
                                shape = CircleShape
                            )
                        )
                )
                Surface(
                    modifier = Modifier.size(16.dp),
                    shape = CircleShape,
                    border = BorderStroke(1.dp, AppColor.TaskIconBorder)
                ) {}
            }
        }
    }
}
