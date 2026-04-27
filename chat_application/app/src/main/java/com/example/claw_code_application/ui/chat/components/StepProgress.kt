package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 步骤进度组件
 * 显示任务执行的多步骤进度，支持折叠/展开
 */
@Composable
fun StepProgress(
    title: String,
    currentStep: Int,
    totalSteps: Int,
    steps: List<StepInfo>,
    isExpanded: Boolean = false,
    onExpandedChange: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.SurfaceLight
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, AppColor.Border)
    ) {
        Column {
            // 头部（可点击展开/收起）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onExpandedChange(!isExpanded) }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // 进度指示器
                    StepProgressIndicator(
                        currentStep = currentStep,
                        totalSteps = totalSteps
                    )

                    Column {
                        Text(
                            text = title,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = AppColor.TextPrimary
                        )

                        Text(
                            text = "步骤 $currentStep / $totalSteps",
                            fontSize = 12.sp,
                            color = AppColor.TextSecondary
                        )
                    }
                }

                // 展开/收起图标
                Icon(
                    imageVector = if (isExpanded) Icons.Default.CheckCircle else Icons.Default.Schedule,
                    contentDescription = if (isExpanded) "收起" else "展开",
                    tint = AppColor.TextSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }

            // 展开的步骤列表
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(
                    animationSpec = tween(300, easing = FastOutSlowInEasing)
                ) + fadeIn(animationSpec = tween(200)),
                exit = shrinkVertically(
                    animationSpec = tween(200, easing = FastOutSlowInEasing)
                ) + fadeOut(animationSpec = tween(150))
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    HorizontalDivider(
                        color = AppColor.Divider,
                        thickness = 1.dp,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )

                    // 步骤列表
                    steps.forEachIndexed { index, step ->
                        StepItem(
                            step = step,
                            isLast = index == steps.size - 1
                        )
                    }
                }
            }
        }
    }
}

/**
 * 步骤进度指示器（圆形进度）
 */
@Composable
private fun StepProgressIndicator(
    currentStep: Int,
    totalSteps: Int
) {
    val progress = if (totalSteps > 0) currentStep.toFloat() / totalSteps else 0f
    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(500, easing = FastOutSlowInEasing),
        label = "progress"
    )

    Box(
        modifier = Modifier.size(40.dp),
        contentAlignment = Alignment.Center
    ) {
        // 背景圆环
        CircularProgressIndicator(
            progress = { 1f },
            modifier = Modifier.fillMaxSize(),
            color = AppColor.Border,
            strokeWidth = 3.dp,
            trackColor = Color.Transparent
        )

        // 进度圆环
        CircularProgressIndicator(
            progress = { animatedProgress },
            modifier = Modifier.fillMaxSize(),
            color = AppColor.Primary,
            strokeWidth = 3.dp,
            trackColor = Color.Transparent
        )

        // 步骤数字
        Text(
            text = "$currentStep/$totalSteps",
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = AppColor.Primary
        )
    }
}

/**
 * 单个步骤项
 */
@Composable
private fun StepItem(
    step: StepInfo,
    isLast: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        // 左侧图标和连接线
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 状态图标
            StepStatusIcon(status = step.status)

            // 连接线（如果不是最后一个）
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(24.dp)
                        .background(
                            color = when (step.status) {
                                StepStatus.COMPLETED -> AppColor.Success.copy(alpha = 0.3f)
                                else -> AppColor.Border
                            }
                        )
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        // 步骤内容
        Column(
            modifier = Modifier.padding(bottom = if (isLast) 0.dp else 8.dp)
        ) {
            Text(
                text = step.title,
                fontSize = 13.sp,
                fontWeight = if (step.status == StepStatus.IN_PROGRESS)
                    FontWeight.SemiBold else FontWeight.Normal,
                color = when (step.status) {
                    StepStatus.COMPLETED -> AppColor.TextPrimary
                    StepStatus.IN_PROGRESS -> AppColor.Primary
                    StepStatus.ERROR -> AppColor.Error
                    else -> AppColor.TextSecondary
                }
            )

            // 状态标签
            if (step.status == StepStatus.IN_PROGRESS) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "执行中...",
                    fontSize = 11.sp,
                    color = AppColor.Primary
                )
            }
        }
    }
}

/**
 * 步骤状态图标
 */
@Composable
private fun StepStatusIcon(status: StepStatus) {
    when (status) {
        StepStatus.COMPLETED -> {
            Icon(
                imageVector = Icons.Default.CheckCircle,
                contentDescription = "已完成",
                tint = AppColor.Success,
                modifier = Modifier.size(20.dp)
            )
        }
        StepStatus.IN_PROGRESS -> {
            // 脉冲动画
            val infiniteTransition = rememberInfiniteTransition(label = "pulse")
            val alpha by infiniteTransition.animateFloat(
                initialValue = 1f,
                targetValue = 0.4f,
                animationSpec = infiniteRepeatable(
                    animation = tween(800, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "pulse"
            )

            Box(
                modifier = Modifier
                    .size(20.dp)
                    .background(
                        color = AppColor.Primary.copy(alpha = alpha),
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            color = AppColor.Primary,
                            shape = CircleShape
                        )
                )
            }
        }
        StepStatus.ERROR -> {
            Icon(
                imageVector = Icons.Default.Error,
                contentDescription = "失败",
                tint = AppColor.Error,
                modifier = Modifier.size(20.dp)
            )
        }
        StepStatus.PENDING -> {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .background(
                        color = AppColor.Border,
                        shape = CircleShape
                    )
            )
        }
    }
}
