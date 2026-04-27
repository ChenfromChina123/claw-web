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
 * 增强版工具调用卡片组件
 * 类似Web端可折叠的UI设计 - 浅色主题
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
        else -> AppColor.Border
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

    // 状态点颜色
    val statusDotColor = if (toolCall.status == "executing") {
        statusConfig.color.copy(alpha = pulseAlpha)
    } else {
        statusConfig.color
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(
            containerColor = AppColor.SurfaceDark,
            contentColor = AppColor.TextPrimary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, borderColor.copy(alpha = 0.3f))
    ) {
        Column {
            // 头部（可点击展开/收起）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onExpandedChange(!expanded) }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
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
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = toolCall.toolName,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = AppColor.TextPrimary,
                                fontFamily = FontFamily.Monospace
                            )

                            // 状态徽章
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = statusConfig.backgroundColor
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(5.dp)
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

                        // 工具摘要（简短描述）
                        if (summary.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = summary,
                                fontSize = 11.sp,
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

            // 展开内容区域
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
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    HorizontalDivider(
                        color = AppColor.Divider,
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
                        // 错误提示框
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = AppColor.Error.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, AppColor.Error.copy(alpha = 0.3f))
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(text = "⚠️", fontSize = 14.sp)
                                    Text(
                                        text = "工具执行失败",
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 13.sp,
                                        color = AppColor.Error
                                    )
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = AppColor.Error.copy(alpha = 0.15f)
                                    ) {
                                        Text(
                                            text = "ERROR",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = AppColor.Error,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                Text(
                                    text = toolCall.error!!,
                                    fontSize = 12.sp,
                                    color = AppColor.Error,
                                    fontFamily = FontFamily.Monospace
                                )

                                // 重试按钮
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(
                                    onClick = onRetry,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = AppColor.Error
                                    ),
                                    shape = RoundedCornerShape(6.dp),
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
 * 结果区域组件
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
                horizontalArrangement = Arrangement.spacedBy(6.dp),
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

        Spacer(modifier = Modifier.height(8.dp))

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            color = AppColor.BackgroundDark
        ) {
            Text(
                text = content,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                color = contentColor,
                modifier = Modifier.padding(12.dp)
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
 * 获取状态配置
 */
private fun getStatusConfig(status: String): StatusConfig {
    return when (status) {
        "pending" -> StatusConfig(
            label = "等待",
            color = Color(0xFF9CA3AF),
            backgroundColor = Color(0xFF9CA3AF).copy(alpha = 0.12f)
        )
        "executing" -> StatusConfig(
            label = "执行中",
            color = Color(0xFFF59E0B),
            backgroundColor = Color(0xFFF59E0B).copy(alpha = 0.12f)
        )
        "completed" -> StatusConfig(
            label = "完成",
            color = Color(0xFF22C55E),
            backgroundColor = Color(0xFF22C55E).copy(alpha = 0.12f)
        )
        "error" -> StatusConfig(
            label = "错误",
            color = Color(0xFFEF4444),
            backgroundColor = Color(0xFFEF4444).copy(alpha = 0.12f)
        )
        else -> StatusConfig(
            label = "未知",
            color = AppColor.TextSecondary,
            backgroundColor = AppColor.TextSecondary.copy(alpha = 0.12f)
        )
    }
}

/**
 * 获取工具图标
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
        else -> "⚙️"
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
 * 获取工具摘要（简短描述）
 */
private fun getToolSummary(toolCall: ToolCall): String {
    val input = parseToolInput(toolCall.toolInput)

    return when {
        // Shell 命令
        toolCall.toolName.contains("shell", ignoreCase = true) -> {
            val cmd = input["command"] ?: input["cmd"] ?: input["script"] ?: ""
            cmd.toString().take(60).replace("\n", " ")
        }
        // 文件操作
        toolCall.toolName.contains("file", ignoreCase = true) ||
        toolCall.toolName.contains("write", ignoreCase = true) -> {
            val path = input["file_path"] ?: input["path"] ?: input["filepath"] ?: ""
            if (path.toString().isNotEmpty()) "操作文件: $path" else ""
        }
        toolCall.toolName.contains("read", ignoreCase = true) -> {
            val path = input["file_path"] ?: input["path"] ?: input["filepath"] ?: ""
            if (path.toString().isNotEmpty()) "读取文件: $path" else ""
        }
        // 搜索
        toolCall.toolName.contains("search", ignoreCase = true) -> {
            val query = input["query"] ?: input["keyword"] ?: input["term"] ?: ""
            if (query.toString().isNotEmpty()) "搜索: $query" else ""
        }
        // Git 操作
        toolCall.toolName.contains("git", ignoreCase = true) -> {
            val action = input["action"] ?: input["command"] ?: ""
            "Git $action"
        }
        // API 调用
        toolCall.toolName.contains("api", ignoreCase = true) -> {
            val url = input["url"] ?: input["endpoint"] ?: ""
            url.toString().take(40)
        }
        // 默认
        else -> {
            val keys = input.keys
            if (keys.isNotEmpty()) {
                val key = keys.first()
                val value = input[key]?.toString()?.take(40) ?: ""
                "$key: $value"
            } else {
                ""
            }
        }
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
