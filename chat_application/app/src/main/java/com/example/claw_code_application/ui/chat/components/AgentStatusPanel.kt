package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.ExecutionStatus
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.theme.Color

/**
 * Agent执行状态面板
 * 复刻Vue前端AgentStatusPanel.vue的设计风格
 * 显示Agent执行进度、轮次、工具调用历史等
 */
@Composable
fun AgentStatusPanel(
    executionStatus: ExecutionStatus?,
    toolCalls: List<ToolCall>,
    isRunning: Boolean,
    onAbort: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.SurfaceDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // 标题行
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "🤖 Agent 执行状态",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = Color.TextPrimary
                )

                // 状态徽章
                if (executionStatus != null) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = when (executionStatus.status) {
                            "running" -> Color.Info.copy(alpha = 0.2f)
                            "completed" -> Color.Success.copy(alpha = 0.2f)
                            "error" -> Color.Error.copy(alpha = 0.2f)
                            else -> Color.SurfaceLight
                        }
                    ) {
                        Text(
                            text = when (executionStatus.status) {
                                "idle" -> "空闲"
                                "running" -> "运行中"
                                "completed" -> "已完成"
                                "error" -> "错误"
                                else -> "未知"
                            },
                            color = when (executionStatus.status) {
                                "running" -> Color.Info
                                "completed" -> Color.Success
                                "error" -> Color.Error
                                else -> Color.TextSecondary
                            },
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 进度条（仅在运行中显示）
            if (executionStatus != null && executionStatus.status == "running") {
                Column {
                    LinearProgressIndicator(
                        progress = { executionStatus.progress / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = Color.SurfaceLight,
                        trackColor = Color.BackgroundDark
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    Text(
                        text = "${executionStatus.progress}%",
                        textAlign = androidx.compose.ui.text.style.TextAlign.End,
                        modifier = Modifier.fillMaxWidth(),
                        fontSize = 12.sp,
                        color = Color.TextSecondary
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // 轮次信息
            if (executionStatus != null) {
                Text(
                    text = "轮次: ${executionStatus.currentTurn} / ${executionStatus.maxTurns}",
                    fontSize = 13.sp,
                    color = Color.TextSecondary
                )
                
                // 状态消息
                if (!executionStatus.message.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = executionStatus.message!!,
                        fontSize = 13.sp,
                        color = Color.TextPrimary,
                        fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // 工具调用列表
            if (toolCalls.isNotEmpty()) {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "📋 工具调用历史",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    color = Color.TextPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))

                toolCalls.forEach { toolCall ->
                    ToolCallListItem(toolCall = toolCall)
                    Spacer(modifier = Modifier.height(4.dp))
                }
            }

            // 中断按钮（仅运行中显示）
            if (isRunning) {
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onAbort,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Error),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Stop,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "中断执行",
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

/**
 * 工具调用列表项（简化版，用于状态面板中展示）
 */
@Composable
private fun ToolCallListItem(toolCall: ToolCall) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 状态图标
        Text(
            text = when (toolCall.status) {
                "executing" -> "⚙️"
                "completed" -> "✅"
                "error" -> "❌"
                else -> "⏳"
            },
            fontSize = 14.sp
        )

        Spacer(modifier = Modifier.width(8.dp))

        // 工具名称
        Text(
            text = toolCall.toolName,
            fontSize = 13.sp,
            color = Color.TextPrimary,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        // 执行状态
        if (toolCall.status == "executing") {
            CircularProgressIndicator(
                modifier = Modifier.size(12.dp),
                strokeWidth = 2.dp,
                color = Color.Info
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = "运行中...",
                fontSize = 11.sp,
                color = Color.Info
            )
        }
    }
}
