package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.RemoteWorker
import com.example.claw_code_application.data.api.models.RemoteWorkerStats
import java.text.SimpleDateFormat
import java.util.*

/**
 * 远程 Worker 管理区域组件
 * 显示在设置侧栏中
 */
@Composable
fun RemoteWorkerSection(
    workers: List<RemoteWorker>,
    stats: RemoteWorkerStats,
    isLoading: Boolean,
    isAdmin: Boolean,
    onRefresh: () -> Unit,
    onAddWorker: () -> Unit,
    onWorkerClick: (RemoteWorker) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(
            modifier = Modifier.fillMaxWidth()
        ) {
            // 标题栏
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded }
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Computer,
                        contentDescription = "远程 Worker",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )

                    Column {
                        Text(
                            text = "远程 Worker",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "${stats.healthy}/${stats.total} 健康",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // 状态指示器
                    WorkerStatusIndicator(stats)

                    // 展开/折叠图标
                    Icon(
                        imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = if (expanded) "折叠" else "展开",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // 展开内容
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    // 统计信息卡片
                    WorkerStatsCard(stats)

                    Spacer(modifier = Modifier.height(12.dp))

                    // Worker 列表
                    if (isLoading) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(100.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(32.dp),
                                strokeWidth = 2.dp
                            )
                        }
                    } else if (workers.isEmpty()) {
                        EmptyWorkerList(isAdmin, onAddWorker)
                    } else {
                        WorkerList(
                            workers = workers,
                            onWorkerClick = onWorkerClick,
                            isAdmin = isAdmin,
                            onAddWorker = onAddWorker
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // 刷新按钮
                    TextButton(
                        onClick = onRefresh,
                        modifier = Modifier.align(Alignment.End)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "刷新",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("刷新状态")
                    }
                }
            }
        }
    }
}

/**
 * Worker 状态指示器
 */
@Composable
private fun WorkerStatusIndicator(stats: RemoteWorkerStats) {
    val color = when {
        stats.total == 0 -> Color.Gray
        stats.unhealthy > 0 -> Color(0xFFFFA726) // 橙色警告
        else -> Color(0xFF4CAF50) // 绿色正常
    }

    Box(
        modifier = Modifier
            .size(10.dp)
            .clip(CircleShape)
            .background(color)
    )
}

/**
 * 统计信息卡片
 */
@Composable
private fun WorkerStatsCard(stats: RemoteWorkerStats) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            StatItem("总数", stats.total, MaterialTheme.colorScheme.primary)
            StatItem("运行中", stats.running, Color(0xFF4CAF50))
            StatItem("健康", stats.healthy, Color(0xFF2196F3))
            StatItem("异常", stats.unhealthy + stats.error, Color(0xFFF44336))
        }
    }
}

/**
 * 统计项
 */
@Composable
private fun StatItem(label: String, value: Int, color: Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = value.toString(),
            style = MaterialTheme.typography.titleLarge,
            color = color,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * 空列表提示
 */
@Composable
private fun EmptyWorkerList(isAdmin: Boolean, onAddWorker: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Computer,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "暂无远程 Worker",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (isAdmin) {
                Spacer(modifier = Modifier.height(12.dp))

                OutlinedButton(
                    onClick = onAddWorker
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "添加",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("添加 Worker")
                }
            }
        }
    }
}

/**
 * Worker 列表
 */
@Composable
private fun WorkerList(
    workers: List<RemoteWorker>,
    onWorkerClick: (RemoteWorker) -> Unit,
    isAdmin: Boolean,
    onAddWorker: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier.fillMaxWidth()
        ) {
            // Worker 列表
            workers.forEach { worker ->
                WorkerListItem(
                    worker = worker,
                    onClick = { onWorkerClick(worker) }
                )

                if (worker != workers.last()) {
                    Divider(
                        modifier = Modifier.padding(horizontal = 12.dp),
                        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                    )
                }
            }

            // 添加按钮（仅管理员可见）
            if (isAdmin) {
                Divider(
                    modifier = Modifier.padding(horizontal = 12.dp),
                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                )

                TextButton(
                    onClick = onAddWorker,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "添加 Worker",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("添加远程 Worker")
                }
            }
        }
    }
}

/**
 * Worker 列表项
 */
@Composable
private fun WorkerListItem(
    worker: RemoteWorker,
    onClick: () -> Unit
) {
    val statusColor = getWorkerStatusColor(worker.status, worker.healthStatus)
    val statusText = getWorkerStatusText(worker.status, worker.healthStatus)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // 状态指示点
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(statusColor)
        )

        // 信息
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = worker.host,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "端口: ${worker.port}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Text(
                    text = "•",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )

                Text(
                    text = statusText,
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor
                )
            }
        }

        // 箭头
        Icon(
            imageVector = Icons.Default.ChevronRight,
            contentDescription = "查看详情",
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        )
    }
}

/**
 * 获取 Worker 状态颜色
 */
private fun getWorkerStatusColor(status: String, healthStatus: String): Color {
    return when (status) {
        "running" -> when (healthStatus) {
            "healthy" -> Color(0xFF4CAF50)
            "unhealthy" -> Color(0xFFFFA726)
            else -> Color(0xFF2196F3)
        }
        "deploying" -> Color(0xFF9C27B0)
        "error" -> Color(0xFFF44336)
        "offline" -> Color(0xFF9E9E9E)
        else -> Color.Gray
    }
}

/**
 * 获取 Worker 状态文本
 */
private fun getWorkerStatusText(status: String, healthStatus: String): String {
    return when (status) {
        "running" -> when (healthStatus) {
            "healthy" -> "运行正常"
            "unhealthy" -> "不健康"
            else -> "运行中"
        }
        "deploying" -> "部署中"
        "error" -> "错误"
        "offline" -> "离线"
        "removing" -> "移除中"
        else -> status
    }
}

/**
 * 格式化时间
 */
fun formatTime(timeString: String?): String {
    if (timeString.isNullOrEmpty()) return "未知"

    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
        inputFormat.timeZone = TimeZone.getTimeZone("UTC")
        val date = inputFormat.parse(timeString)

        val outputFormat = SimpleDateFormat("MM-dd HH:mm", Locale.getDefault())
        outputFormat.format(date!!)
    } catch (e: Exception) {
        "未知"
    }
}
