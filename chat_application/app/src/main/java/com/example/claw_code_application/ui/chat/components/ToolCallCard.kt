package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.theme.AppColor
import com.google.gson.Gson
import com.google.gson.GsonBuilder

/**
 * 工具调用卡片组件
 * 基于原型Manus风格设计 - 浅色主题
 */
@Composable
fun ToolCallCard(
    toolCall: ToolCall,
    modifier: Modifier = Modifier,
    expanded: Boolean = false,
    onExpandedChange: (Boolean) -> Unit = {},
    onRetry: () -> Unit = {}
) {
    val statusConfig = getStatusConfig(toolCall.status)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.SurfaceDark,
            contentColor = AppColor.TextPrimary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, AppColor.Border)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // 头部（可点击）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onExpandedChange(!expanded) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // 左侧：图标 + 名称 + 状态标签
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // 工具名称 - 原型样式带星号
                    Text(
                        text = "✦ ${toolCall.toolName}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = AppColor.TextPrimary
                    )
                }

                // 右侧：展开箭头
                Icon(
                    imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "收起" else "展开",
                    tint = AppColor.TextSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }

            // 详情区域（可折叠）
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(modifier = Modifier.padding(top = 12.dp)) {
                    HorizontalDivider(color = AppColor.Divider, thickness = 1.dp)
                    Spacer(modifier = Modifier.height(12.dp))

                    // 输入参数
                    Text(
                        text = "📥 输入参数",
                        fontWeight = FontWeight.Medium,
                        fontSize = 13.sp,
                        color = AppColor.TextPrimary
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    // JSON代码块
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        color = AppColor.BackgroundDark
                    ) {
                        Text(
                            text = formatJson(toolCall.toolInput),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            color = AppColor.TextSecondary,
                            modifier = Modifier.padding(12.dp)
                        )
                    }

                    // 输出结果（如果有）
                    if (toolCall.toolOutput != null && toolCall.status == "completed") {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "📤 输出结果",
                            fontWeight = FontWeight.Medium,
                            fontSize = 13.sp,
                            color = AppColor.TextPrimary
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = AppColor.BackgroundDark
                        ) {
                            Text(
                                text = formatJson(toolCall.toolOutput!!),
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                color = AppColor.Success,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }

                    // 错误信息（如果有）
                    if (toolCall.error != null && toolCall.status == "error") {
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = AppColor.Error.copy(alpha = 0.1f)
                        ) {
                            Text(
                                text = "❌ ${toolCall.error}",
                                color = AppColor.Error,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(12.dp)
                            )
                        }

                        // 重试按钮
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = onRetry,
                            colors = ButtonDefaults.buttonColors(containerColor = AppColor.Error),
                            shape = RoundedCornerShape(6.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("重试", fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

/**
 * 工具调用状态配置数据类
 */
private data class StatusConfig(
    val icon: String,
    val label: String,
    val color: Color
)

/**
 * 获取状态配置
 */
private fun getStatusConfig(status: String): StatusConfig {
    return when (status) {
        "pending" -> StatusConfig(icon = "⏳", label = "等待中", color = AppColor.Warning)
        "executing" -> StatusConfig(icon = "⚙️", label = "执行中", color = AppColor.Info)
        "completed" -> StatusConfig(icon = "✅", label = "已完成", color = AppColor.Success)
        "error" -> StatusConfig(icon = "❌", label = "错误", color = AppColor.Error)
        else -> StatusConfig(icon = "❓", label = "未知", color = AppColor.TextSecondary)
    }
}

/** Gson实例用于JSON格式化 */
private val gson: Gson by lazy {
    GsonBuilder().setPrettyPrinting().create()
}

/**
 * 格式化JSON对象为可读字符串
 */
private fun formatJson(obj: Any): String {
    return try {
        gson.toJson(obj)
    } catch (e: Exception) {
        obj.toString()
    }
}

/**
 * 计算执行耗时（格式化为可读字符串）
 */
private fun calculateDuration(startTime: String, endTime: String): String {
    return try {
        val start = startTime.toLong()
        val end = endTime.toLong()
        val durationMs = end - start
        
        when {
            durationMs < 1000L -> "${durationMs}ms"
            durationMs < 60_000L -> "${String.format("%.1f", durationMs / 1000.0)}s"
            else -> "${durationMs / 1000}s"
        }
    } catch (e: Exception) {
        ""
    }
}

/**
 * 格式化执行中的持续时间
 */
private fun formatDuration(startTime: String): String {
    return try {
        val start = startTime.toLong()
        val now = System.currentTimeMillis()
        val durationMs = now - start
        
        when {
            durationMs < 1000L -> "${durationMs}ms"
            durationMs < 60_000L -> "${String.format("%.1f", durationMs / 1000.0)}s"
            else -> "${durationMs / 1000}s"
        }
    } catch (e: Exception) {
        ""
    }
}

/**
 * 格式化日期时间为可读格式
 */
private fun formatDateTime(timestamp: String): String {
    return try {
        val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
        sdf.format(java.util.Date(timestamp.toLong()))
    } catch (e: Exception) {
        timestamp
    }
}
