package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 增强版工具调用卡片组件 - Manus 1.6 Lite 风格
 * 
 * 设计特点：
 * - 浅灰背景，圆角12dp
 * - 状态徽章：浅色背景 + 状态色文字
 * - 展开/收起动画流畅
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
    val summary = getToolSummary(toolCall)

    // 状态对应的边框颜色
    val borderColor = when (toolCall.status) {
        "completed" -> AppColor.Success
        "error" -> AppColor.Error
        "executing" -> AppColor.Warning
        else -> Color(0xFFE8E8ED)
    }

    // 执行中状态的脉冲动画
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_alpha"
    )

    val statusDotColor = if (toolCall.status == "executing") {
        statusConfig.color.copy(alpha = pulseAlpha)
    } else {
        statusConfig.color
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFF5F5F7),
            contentColor = AppColor.TextPrimary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, borderColor.copy(alpha = 0.3f))
    ) {
        Column {
            // 头部（可点击展开/收起）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onExpandedChange(!expanded) }
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    // 工具图标
                    Text(
                        text = getToolIcon(toolCall.toolName),
                        fontSize = 16.sp
                    )

                    Column(modifier = Modifier.weight(1f)) {
                        // 工具名称行
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = toolCall.toolName,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = AppColor.TextPrimary,
                                fontFamily = FontFamily.Monospace
                            )

                            // 状态徽章 - 浅色背景
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = statusConfig.backgroundColor
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    // 状态指示点
                                    Surface(
                                        modifier = Modifier.size(6.dp),
                                        shape = RoundedCornerShape(50),
                                        color = statusDotColor
                                    ) {}

                                    Text(
                                        text = statusConfig.label,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = statusConfig.color
                                    )
                                }
                            }
                        }

                        // 工具摘要
                        if (summary.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = summary,
                                fontSize = 12.sp,
                                color = AppColor.TextSecondary,
                                fontFamily = FontFamily.Monospace,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                // 展开/收起图标
                Icon(
                    imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "收起详情" else "展开详情",
                    tint = AppColor.TextSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }

            // 展开内容区域 - 平滑动画
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(
                    animationSpec = tween(250, easing = FastOutSlowInEasing)
                ) + fadeIn(animationSpec = tween(200)),
                exit = shrinkVertically(
                    animationSpec = tween(200, easing = FastOutSlowInEasing)
                ) + fadeOut(animationSpec = tween(150))
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
                ) {
                    HorizontalDivider(
                        color = Color(0xFFE8E8ED),
                        thickness = 1.dp,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )

                    // 输入参数区域
                    val inputMap = parseToolInput(toolCall.toolInput)
                    if (inputMap.isNotEmpty()) {
                        ResultSection(
                            title = "输入参数",
                            titleIcon = "📥",
                            content = formatToolInput(inputMap),
                            contentColor = AppColor.TextSecondary,
                            metaText = "${inputMap.size} 个参数"
                        )

                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // 输出结果区域
                    if (toolCall.toolOutput != null && toolCall.status == "completed") {
                        ResultSection(
                            title = "执行结果",
                            titleIcon = "📤",
                            content = formatToolOutput(toolCall.toolOutput),
                            contentColor = AppColor.Success,
                            metaText = "${formatToolOutput(toolCall.toolOutput).length} 字符"
                        )

                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // 错误信息区域
                    if (toolCall.error != null && toolCall.status == "error") {
                        // 错误提示框 - 浅红背景
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = AppColor.ErrorBackground,
                            border = BorderStroke(1.dp, AppColor.Error.copy(alpha = 0.3f))
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(text = "⚠️", fontSize = 14.sp)
                                    Text(
                                        text = "工具执行失败",
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 13.sp,
                                        color = AppColor.ErrorText
                                    )
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = AppColor.Error.copy(alpha = 0.15f)
                                    ) {
                                        Text(
                                            text = "ERROR",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = AppColor.ErrorText,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                Text(
                                    text = toolCall.error!!,
                                    fontSize = 12.sp,
                                    color = AppColor.ErrorText.copy(alpha = 0.9f),
                                    fontFamily = FontFamily.Monospace,
                                    lineHeight = 18.sp
                                )

                                // 重试按钮
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(
                                    onClick = onRetry,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = AppColor.Error
                                    ),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = "重试",
                                        fontWeight = FontWeight.Medium,
                                        fontSize = 13.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * 结果区域组件 - Manus 1.6 Lite 风格
 */
@Composable
private fun ResultSection(
    title: String,
    titleIcon: String,
    content: String,
    contentColor: Color,
    metaText: String
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = titleIcon, fontSize = 14.sp)
                Text(
                    text = title,
                    fontWeight = FontWeight.Medium,
                    fontSize = 13.sp,
                    color = AppColor.TextPrimary
                )
            }
            Text(
                text = metaText,
                fontSize = 11.sp,
                color = AppColor.TextSecondary
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            color = Color(0xFFF5F5F7)
        ) {
            Text(
                text = content,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                color = contentColor,
                modifier = Modifier.padding(14.dp),
                lineHeight = 18.sp
            )
        }
    }
}

/**
 * 工具调用状态配置数据类
 */
private data class StatusConfig(
    val label: String,
    val color: Color,
    val backgroundColor: Color
)

/**
 * 获取状态配置 - Manus 风格
 */
private fun getStatusConfig(status: String): StatusConfig {
    return when (status) {
        "pending" -> StatusConfig(
            label = "等待",
            color = Color(0xFF6B7280),
            backgroundColor = Color(0xFFF3F4F6)
        )
        "executing" -> StatusConfig(
            label = "执行中",
            color = AppColor.Warning,
            backgroundColor = Color(0xFFFFF7ED)
        )
        "completed" -> StatusConfig(
            label = "完成",
            color = AppColor.Success,
            backgroundColor = Color(0xFFECFDF5)
        )
        "error" -> StatusConfig(
            label = "错误",
            color = AppColor.Error,
            backgroundColor = Color(0xFFFEE2E2)
        )
        else -> StatusConfig(
            label = "未知",
            color = AppColor.TextSecondary,
            backgroundColor = Color(0xFFF3F4F6)
        )
    }
}

/**
 * 获取工具图标 - 简洁风格
 */
private fun getToolIcon(toolName: String): String {
    return when {
        toolName.contains("shell", ignoreCase = true) ||
        toolName.contains("bash", ignoreCase = true) ||
        toolName.contains("command", ignoreCase = true) -> "⌨️"
        toolName.contains("file", ignoreCase = true) ||
        toolName.contains("write", ignoreCase = true) ||
        toolName.contains("read", ignoreCase = true) -> "📄"
        toolName.contains("search", ignoreCase = true) ||
        toolName.contains("find", ignoreCase = true) -> "🔍"
        toolName.contains("git", ignoreCase = true) -> "🔀"
        toolName.contains("web", ignoreCase = true) ||
        toolName.contains("http", ignoreCase = true) -> "🌐"
        toolName.contains("browser", ignoreCase = true) ||
        toolName.contains("visit", ignoreCase = true) -> "🌍"
        toolName.contains("code", ignoreCase = true) ||
        toolName.contains("edit", ignoreCase = true) -> "✏️"
        toolName.contains("run", ignoreCase = true) ||
        toolName.contains("execute", ignoreCase = true) -> "▶️"
        toolName.contains("test", ignoreCase = true) -> "🧪"
        toolName.contains("install", ignoreCase = true) ||
        toolName.contains("npm", ignoreCase = true) -> "📦"
        toolName.contains("docker", ignoreCase = true) -> "🐳"
        toolName.contains("api", ignoreCase = true) -> "🔌"
        toolName.contains("data", ignoreCase = true) -> "💾"
        else -> "⚡"
    }
}

/**
 * 解析工具输入为 Map
 */
@Suppress("UNCHECKED_CAST")
private fun parseToolInput(input: Any): Map<String, Any> {
    return when (input) {
        is Map<*, *> -> input as Map<String, Any>
        is String -> {
            // 尝试解析 JSON 字符串
            try {
                val gson = com.google.gson.Gson()
                val map = gson.fromJson(input, Map::class.java)
                map as Map<String, Any>
            } catch (e: Exception) {
                emptyMap()
            }
        }
        else -> emptyMap()
    }
}

/**
 * 获取工具摘要（简短描述，使用 ToolParser 增强解析）
 */
private fun getToolSummary(toolCall: ToolCall): String {
    val parsedInfo = ToolParser.parseToolCall(toolCall)
    val primaryParam = parsedInfo.parameters.firstOrNull()

    return when {
        primaryParam != null -> {
            val valueStr = primaryParam.value?.toString()?.take(60)?.replace("\n", " ") ?: ""
            if (valueStr.isNotEmpty()) "${primaryParam.name}: $valueStr" else parsedInfo.description
        }
        else -> parsedInfo.description
    }
}

/**
 * 格式化工具输入参数
 */
private fun formatToolInput(input: Map<String, Any>): String {
    return try {
        val gson = com.google.gson.GsonBuilder()
            .setPrettyPrinting()
            .create()
        gson.toJson(input)
    } catch (e: Exception) {
        input.toString()
    }
}

/**
 * 格式化工具输出
 */
private fun formatToolOutput(output: Any): String {
    return try {
        // 尝试解析 JSON
        if (output is String) {
            val gson = com.google.gson.GsonBuilder()
                .setPrettyPrinting()
                .create()
            val jsonElement = com.google.gson.JsonParser.parseString(output)
            gson.toJson(jsonElement)
        } else {
            output.toString()
        }
    } catch (e: Exception) {
        output.toString()
    }
}
