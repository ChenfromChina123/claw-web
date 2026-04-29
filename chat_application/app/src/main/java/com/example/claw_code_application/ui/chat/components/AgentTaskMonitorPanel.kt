package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.AgentBackgroundTask
import com.example.claw_code_application.data.api.models.BackgroundTaskStatus
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.AgentTaskMonitorViewModel

/**
 * Agent任务监控面板 - 全局持久化悬浮组件
 * 显示Agent任务的创建、进度和完成状态
 * 最小化时显示为悬浮徽章，展开时显示任务列表
 *
 * @param viewModel Agent任务监控ViewModel
 * @param onTaskClick 任务点击回调
 */
@Composable
fun AgentTaskMonitorPanel(
    viewModel: AgentTaskMonitorViewModel,
    onTaskClick: ((AgentBackgroundTask) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val tasks by remember { mutableStateOf(viewModel.tasks) }
    val isMinimized by viewModel.isMinimized.collectAsState()
    val isExpanded by viewModel.isExpanded.collectAsState()
    val monitorState by viewModel.monitorState.collectAsState()

    val activeCount = monitorState.activeTaskCount

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomEnd
    ) {
        AnimatedVisibility(
            visible = isMinimized,
            enter = scaleIn(initialScale = 0.5f) + fadeIn(),
            exit = scaleOut(targetScale = 0.5f) + fadeOut()
        ) {
            MinimizedBadge(
                activeCount = activeCount,
                hasFailed = monitorState.failedTaskCount > 0,
                onClick = { viewModel.toggleMinimized() }
            )
        }

        AnimatedVisibility(
            visible = !isMinimized,
            enter = slideInVertically(initialOffsetY = { it / 2 }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { it / 2 }) + fadeOut()
        ) {
            ExpandedPanel(
                tasks = tasks,
                isExpanded = isExpanded,
                activeCount = activeCount,
                completedCount = monitorState.completedTaskCount,
                failedCount = monitorState.failedTaskCount,
                onToggleExpanded = { viewModel.toggleExpanded() },
                onMinimize = { viewModel.toggleMinimized() },
                onClearCompleted = { viewModel.clearCompletedTasks() },
                onCancelTask = { taskId -> viewModel.cancelTask(taskId) },
                onTaskClick = onTaskClick
            )
        }
    }
}

/**
 * 最小化悬浮徽章
 * 显示活跃任务数量的圆形图标
 */
@Composable
private fun MinimizedBadge(
    activeCount: Int,
    hasFailed: Boolean,
    onClick: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "badge_pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (activeCount > 0) 1.08f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "badge_scale"
    )

    Box(
        modifier = Modifier
            .padding(end = 16.dp, bottom = 80.dp)
            .size(52.dp * scale)
            .shadow(8.dp, CircleShape)
            .background(
                color = when {
                    hasFailed -> AppColor.Error
                    activeCount > 0 -> AppColor.Primary
                    else -> AppColor.SurfaceLight
                },
                shape = CircleShape
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.SmartToy,
                contentDescription = "Agent任务",
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )
            if (activeCount > 0) {
                Text(
                    text = activeCount.toString(),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }
    }
}

/**
 * 展开面板
 * 显示任务列表和统计信息
 */
@Composable
private fun ExpandedPanel(
    tasks: List<AgentBackgroundTask>,
    isExpanded: Boolean,
    activeCount: Int,
    completedCount: Int,
    failedCount: Int,
    onToggleExpanded: () -> Unit,
    onMinimize: () -> Unit,
    onClearCompleted: () -> Unit,
    onCancelTask: (String) -> Unit,
    onTaskClick: ((AgentBackgroundTask) -> Unit)?
) {
    Card(
        modifier = Modifier
            .padding(end = 12.dp, bottom = 80.dp, start = 12.dp)
            .width(320.dp)
            .shadow(12.dp, RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = AppColor.SurfaceDark),
        border = BorderStroke(1.dp, AppColor.Border)
    ) {
        Column {
            PanelHeader(
                activeCount = activeCount,
                isExpanded = isExpanded,
                onToggleExpanded = onToggleExpanded,
                onMinimize = onMinimize,
                onClearCompleted = onClearCompleted,
                hasCompleted = completedCount > 0 || failedCount > 0
            )

            StatsBar(
                activeCount = activeCount,
                completedCount = completedCount,
                failedCount = failedCount
            )

            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(
                    animationSpec = tween(250, easing = FastOutSlowInEasing)
                ) + fadeIn(animationSpec = tween(200)),
                exit = shrinkVertically(
                    animationSpec = tween(200, easing = FastOutSlowInEasing)
                ) + fadeOut(animationSpec = tween(150))
            ) {
                TaskList(
                    tasks = tasks,
                    onCancelTask = onCancelTask,
                    onTaskClick = onTaskClick
                )
            }
        }
    }
}

/**
 * 面板头部
 */
@Composable
private fun PanelHeader(
    activeCount: Int,
    isExpanded: Boolean,
    onToggleExpanded: () -> Unit,
    onMinimize: () -> Unit,
    onClearCompleted: () -> Unit,
    hasCompleted: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggleExpanded() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Default.SmartToy,
                contentDescription = null,
                tint = AppColor.Primary,
                modifier = Modifier.size(20.dp)
            )
            Text(
                text = "Agent 任务",
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = AppColor.TextPrimary
            )
            if (activeCount > 0) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = AppColor.Primary.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = "$activeCount 运行中",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = AppColor.Primary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (hasCompleted) {
                IconButton(
                    onClick = onClearCompleted,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.CleaningServices,
                        contentDescription = "清除已完成",
                        tint = AppColor.TextSecondary,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
            IconButton(
                onClick = onMinimize,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "最小化",
                    tint = AppColor.TextSecondary,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

/**
 * 统计栏
 */
@Composable
private fun StatsBar(
    activeCount: Int,
    completedCount: Int,
    failedCount: Int
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        StatChip(count = activeCount, label = "运行中", color = AppColor.Info)
        StatChip(count = completedCount, label = "已完成", color = AppColor.Success)
        StatChip(count = failedCount, label = "失败", color = AppColor.Error)
    }
}

/**
 * 统计芯片
 */
@Composable
private fun StatChip(count: Int, label: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = color.copy(alpha = 0.1f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = count.toString(),
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = color
            )
            Text(
                text = label,
                fontSize = 11.sp,
                color = AppColor.TextSecondary
            )
        }
    }
}

/**
 * 任务列表
 */
@Composable
private fun TaskList(
    tasks: List<AgentBackgroundTask>,
    onCancelTask: (String) -> Unit,
    onTaskClick: ((AgentBackgroundTask) -> Unit)?
) {
    if (tasks.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = AppColor.TextSecondary.copy(alpha = 0.5f),
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "暂无Agent任务",
                    fontSize = 12.sp,
                    color = AppColor.TextSecondary
                )
            }
        }
        return
    }

    val indexedTasks = remember(tasks) {
        tasks.mapIndexed { index, task -> index to task }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 300.dp)
            .padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        items(
            items = indexedTasks,
            // 使用 index 辅助确保 key 唯一性
            key = { (index, task) -> "${task.taskId}_$index" }
        ) { (index, task) ->
            TaskItem(
                task = task,
                onCancel = { onCancelTask(task.taskId) },
                onClick = { onTaskClick?.invoke(task) }
            )
        }
    }
}

/**
 * 单个任务项
 */
@Composable
private fun TaskItem(
    task: AgentBackgroundTask,
    onCancel: () -> Unit,
    onClick: () -> Unit
) {
    val statusConfig = getTaskStatusConfig(task.status)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(10.dp),
        color = statusConfig.bgColor,
        border = BorderStroke(1.dp, statusConfig.borderColor)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            TaskStatusIcon(status = task.status)

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = task.name,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = AppColor.TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = statusConfig.labelBgColor
                    ) {
                        Text(
                            text = statusConfig.label,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = statusConfig.labelColor,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = formatTime(task.createdAt),
                        fontSize = 11.sp,
                        color = AppColor.TextSecondary
                    )
                    if (task.startedAt != null) {
                        Text(
                            text = formatDuration(task.startedAt, task.completedAt),
                            fontSize = 11.sp,
                            color = AppColor.TextSecondary
                        )
                    }
                }

                if (task.status == BackgroundTaskStatus.RUNNING) {
                    LinearProgressIndicator(
                        progress = { task.progress / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .clip(RoundedCornerShape(2.dp)),
                        color = AppColor.Info,
                        trackColor = AppColor.SurfaceLight,
                    )
                }

                if (task.error != null) {
                    Text(
                        text = task.error,
                        fontSize = 11.sp,
                        color = AppColor.Error,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (task.status == BackgroundTaskStatus.RUNNING || task.status == BackgroundTaskStatus.PENDING) {
                IconButton(
                    onClick = onCancel,
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "取消",
                        tint = AppColor.TextSecondary,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        }
    }
}

/**
 * 任务状态图标
 */
@Composable
private fun TaskStatusIcon(status: BackgroundTaskStatus) {
    when (status) {
        BackgroundTaskStatus.PENDING -> {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(AppColor.SurfaceLight, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "⏳", fontSize = 14.sp)
            }
        }
        BackgroundTaskStatus.RUNNING -> {
            val infiniteTransition = rememberInfiniteTransition(label = "task_pulse")
            val alpha by infiniteTransition.animateFloat(
                initialValue = 1f,
                targetValue = 0.5f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "task_alpha"
            )
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(AppColor.Info.copy(alpha = alpha * 0.2f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                    color = AppColor.Info
                )
            }
        }
        BackgroundTaskStatus.COMPLETED -> {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(AppColor.Success.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = AppColor.Success,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
        BackgroundTaskStatus.FAILED -> {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(AppColor.Error.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Error,
                    contentDescription = null,
                    tint = AppColor.Error,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
        BackgroundTaskStatus.CANCELLED -> {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(AppColor.SurfaceLight, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "🚫", fontSize = 12.sp)
            }
        }
    }
}

/**
 * 任务状态配置
 */
private data class TaskStatusUIConfig(
    val label: String,
    val labelColor: Color,
    val labelBgColor: Color,
    val bgColor: Color,
    val borderColor: Color
)

@Composable
private fun getTaskStatusConfig(status: BackgroundTaskStatus): TaskStatusUIConfig {
    return when (status) {
        BackgroundTaskStatus.PENDING -> TaskStatusUIConfig(
            label = "等待中",
            labelColor = AppColor.TextSecondary,
            labelBgColor = AppColor.SurfaceLight,
            bgColor = AppColor.SurfaceDark,
            borderColor = AppColor.Border
        )
        BackgroundTaskStatus.RUNNING -> TaskStatusUIConfig(
            label = "运行中",
            labelColor = AppColor.Info,
            labelBgColor = AppColor.Info.copy(alpha = 0.1f),
            bgColor = AppColor.Info.copy(alpha = 0.03f),
            borderColor = AppColor.Info.copy(alpha = 0.2f)
        )
        BackgroundTaskStatus.COMPLETED -> TaskStatusUIConfig(
            label = "已完成",
            labelColor = AppColor.Success,
            labelBgColor = AppColor.Success.copy(alpha = 0.1f),
            bgColor = AppColor.SurfaceDark,
            borderColor = AppColor.Border
        )
        BackgroundTaskStatus.FAILED -> TaskStatusUIConfig(
            label = "失败",
            labelColor = AppColor.Error,
            labelBgColor = AppColor.Error.copy(alpha = 0.1f),
            bgColor = AppColor.Error.copy(alpha = 0.03f),
            borderColor = AppColor.Error.copy(alpha = 0.2f)
        )
        BackgroundTaskStatus.CANCELLED -> TaskStatusUIConfig(
            label = "已取消",
            labelColor = AppColor.TextSecondary,
            labelBgColor = AppColor.SurfaceLight,
            bgColor = AppColor.SurfaceDark,
            borderColor = AppColor.Border
        )
    }
}

/**
 * 格式化时间
 */
private fun formatTime(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    return when {
        diff < 60000 -> "刚刚"
        diff < 3600000 -> "${diff / 60000}分钟前"
        diff < 86400000 -> "${diff / 3600000}小时前"
        else -> "${diff / 86400000}天前"
    }
}

/**
 * 格式化耗时
 */
private fun formatDuration(startAt: Long, completedAt: Long?): String {
    val end = completedAt ?: System.currentTimeMillis()
    val duration = end - startAt
    return when {
        duration < 1000 -> "${duration}ms"
        duration < 60000 -> "${duration / 1000}s"
        else -> "${duration / 60000}m ${(duration % 60000) / 1000}s"
    }
}
