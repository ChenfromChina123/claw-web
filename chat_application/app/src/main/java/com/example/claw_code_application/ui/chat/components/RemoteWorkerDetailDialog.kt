package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.claw_code_application.data.api.models.RemoteWorker
import com.example.claw_code_application.data.api.models.SystemInfo
import kotlin.math.max

/**
 * 远程 Worker 详情对话框
 */
@Composable
fun RemoteWorkerDetailDialog(
    worker: RemoteWorker,
    onDismiss: () -> Unit,
    onRemove: (String) -> Unit,
    isAdmin: Boolean
) {
    var showRemoveConfirm by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // 标题栏
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Computer,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                        Text(
                            text = "Worker 详情",
                            style = MaterialTheme.typography.headlineSmall
                        )
                    }

                    // 状态标签
                    WorkerStatusChip(worker.status, worker.healthStatus)
                }

                Spacer(modifier = Modifier.height(20.dp))

                // 基本信息
                InfoSection(title = "基本信息") {
                    InfoItem("Worker ID", worker.workerId)
                    InfoItem("主机地址", worker.host)
                    InfoItem("端口", worker.port.toString())
                    InfoItem("SSH 用户", worker.sshUsername ?: "未设置")
                    InfoItem("SSH 端口", worker.sshPort?.toString() ?: "未设置")
                }

                Spacer(modifier = Modifier.height(16.dp))

                // 系统信息
                if (worker.systemInfo != null) {
                    InfoSection(title = "系统信息") {
                        SystemInfoItems(worker.systemInfo)
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Docker 版本
                if (!worker.dockerVersion.isNullOrEmpty()) {
                    InfoSection(title = "Docker") {
                        InfoItem("版本", worker.dockerVersion)
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // 标签
                if (!worker.labels.isNullOrEmpty()) {
                    InfoSection(title = "标签") {
                        FlowRowLayout(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalGap = 8.dp,
                            verticalGap = 8.dp
                        ) {
                            worker.labels.forEach { (key, value) ->
                                LabelChip("$key: $value")
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // 时间信息
                InfoSection(title = "时间") {
                    InfoItem("创建时间", formatTime(worker.createdAt))
                    InfoItem("更新时间", formatTime(worker.updatedAt))
                    InfoItem("最后心跳", formatTime(worker.lastHeartbeatAt))
                }

                Spacer(modifier = Modifier.height(24.dp))

                // 按钮
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("关闭")
                    }

                    if (isAdmin) {
                        Button(
                            onClick = { showRemoveConfirm = true },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "移除",
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("移除")
                        }
                    }
                }
            }
        }
    }

    // 移除确认对话框
    if (showRemoveConfirm) {
        AlertDialog(
            onDismissRequest = { showRemoveConfirm = false },
            title = { Text("确认移除") },
            text = {
                Text("确定要移除远程 Worker ${worker.host}:${worker.port} 吗？此操作不可恢复。")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRemoveConfirm = false
                        onRemove(worker.workerId)
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("确认移除")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRemoveConfirm = false }) {
                    Text("取消")
                }
            }
        )
    }
}

/**
 * 信息区域
 */
@Composable
private fun InfoSection(
    title: String,
    content: @Composable () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))
        content()
    }
}

/**
 * 信息项
 */
@Composable
private fun InfoItem(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * 系统信息项
 */
@Composable
private fun SystemInfoItems(systemInfo: SystemInfo) {
    systemInfo.os?.let { InfoItem("操作系统", it) }
    systemInfo.arch?.let { InfoItem("架构", it) }
    systemInfo.cpuCores?.let { InfoItem("CPU 核心", "${it} 核") }
    systemInfo.memoryGB?.let { InfoItem("内存", "${it} GB") }
    systemInfo.diskGB?.let { InfoItem("磁盘", "${it} GB") }
}

/**
 * 状态标签
 */
@Composable
private fun WorkerStatusChip(status: String, healthStatus: String) {
    val (text, color) = when (status) {
        "running" -> when (healthStatus) {
            "healthy" -> "运行正常" to Color(0xFF4CAF50)
            "unhealthy" -> "不健康" to Color(0xFFFFA726)
            else -> "运行中" to Color(0xFF2196F3)
        }
        "deploying" -> "部署中" to Color(0xFF9C27B0)
        "error" -> "错误" to Color(0xFFF44336)
        "offline" -> "离线" to Color(0xFF9E9E9E)
        "removing" -> "移除中" to Color(0xFF757575)
        else -> status to Color.Gray
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = color.copy(alpha = 0.15f),
        modifier = Modifier.wrapContentSize()
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = color,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * 标签芯片
 */
@Composable
private fun LabelChip(text: String) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.wrapContentSize()
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

/**
 * FlowRow 布局（简化版）
 */
@Composable
private fun FlowRowLayout(
    modifier: Modifier = Modifier,
    horizontalGap: androidx.compose.ui.unit.Dp = 8.dp,
    verticalGap: androidx.compose.ui.unit.Dp = 8.dp,
    content: @Composable () -> Unit
) {
    Layout(
        content = content,
        modifier = modifier
    ) { measurables, constraints ->
        val hGapPx = horizontalGap.roundToPx()
        val vGapPx = verticalGap.roundToPx()

        val rows = mutableListOf<List<androidx.compose.ui.layout.Placeable>>()
        val rowWidths = mutableListOf<Int>()
        val rowHeights = mutableListOf<Int>()

        var currentRow = mutableListOf<androidx.compose.ui.layout.Placeable>()
        var currentRowWidth = 0
        var currentRowHeight = 0

        measurables.forEach { measurable ->
            val placeable = measurable.measure(constraints)

            if (currentRow.isNotEmpty() &&
                currentRowWidth + hGapPx + placeable.width > constraints.maxWidth) {
                rows.add(currentRow)
                rowWidths.add(currentRowWidth)
                rowHeights.add(currentRowHeight)
                currentRow = mutableListOf()
                currentRowWidth = 0
                currentRowHeight = 0
            }

            currentRow.add(placeable)
            currentRowWidth += if (currentRow.size == 1) placeable.width else hGapPx + placeable.width
            currentRowHeight = kotlin.math.max(currentRowHeight, placeable.height)
        }

        if (currentRow.isNotEmpty()) {
            rows.add(currentRow)
            rowWidths.add(currentRowWidth)
            rowHeights.add(currentRowHeight)
        }

        val width = constraints.maxWidth
        val height = rowHeights.sum() + kotlin.math.max(0, rowHeights.size - 1) * vGapPx

        layout(width, height) {
            var y = 0
            rows.forEachIndexed { rowIndex, row ->
                var x = 0

                row.forEach { placeable ->
                    placeable.placeRelative(x, y)
                    x += placeable.width + hGapPx
                }

                y += rowHeights[rowIndex] + vGapPx
            }
        }
    }
}
