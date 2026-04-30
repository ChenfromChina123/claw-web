package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private object JsonPool {
    private val jsonInstance = Json {
        ignoreUnknownKeys = true
        isLenient = true
        prettyPrint = false
    }

    fun getJson(): Json = jsonInstance
}

@Composable
fun ToolCallCard(
    toolCall: ToolCall,
    modifier: Modifier = Modifier,
    expanded: Boolean = false,
    onExpandedChange: (Boolean) -> Unit = {},
    onRetry: () -> Unit = {}
) {
    val statusConfig = getStatusConfig(toolCall.status)

    val summary by remember(toolCall.id, toolCall.toolInput) { derivedStateOf { getToolSummary(toolCall) } }

    val parsedInput by remember(toolCall.id, toolCall.toolInput) {
        derivedStateOf {
            val inputMap = parseToolInput(toolCall.toolInput)
            val formattedInput = if (inputMap.isNotEmpty()) formatToolInput(inputMap) else ""
            Pair(inputMap, formattedInput)
        }
    }

    val formattedOutput by remember(toolCall.id, toolCall.toolOutput, toolCall.status) {
        derivedStateOf {
            // 在 completed 或 error 状态下都显示执行结果
            if (toolCall.toolOutput != null &&
                (toolCall.status == "completed" || toolCall.status == "error")) {
                formatToolOutput(toolCall.toolOutput)
            } else {
                ""
            }
        }
    }

    val borderColor = when (toolCall.status) {
        "completed" -> AppColor.Success
        "error" -> AppColor.Error
        "executing" -> AppColor.Warning
        else -> Color(0xFFE8E8ED)
    }

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
                    Text(
                        text = getToolIcon(toolCall.toolName),
                        fontSize = 16.sp
                    )

                    Column(modifier = Modifier.weight(1f)) {
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

                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = statusConfig.backgroundColor
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
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

                Icon(
                    imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "收起详情" else "展开详情",
                    tint = AppColor.TextSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }

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

                    val (inputMap, formattedInput) = parsedInput
                    if (inputMap.isNotEmpty()) {
                        ResultSection(
                            title = "输入参数",
                            titleIcon = "📥",
                            content = formattedInput,
                            contentColor = AppColor.TextSecondary,
                            metaText = "${inputMap.size} 个参数"
                        )

                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    if (formattedOutput.isNotEmpty()) {
                        // 根据状态决定执行结果的颜色
                        val outputColor = if (toolCall.status == "error") {
                            AppColor.Error
                        } else {
                            AppColor.Success
                        }
                        ResultSection(
                            title = "执行结果",
                            titleIcon = "📤",
                            content = formattedOutput,
                            contentColor = outputColor,
                            metaText = "${formattedOutput.length} 字符"
                        )

                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    if (toolCall.error != null && toolCall.status == "error") {
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

private data class StatusConfig(
    val label: String,
    val color: Color,
    val backgroundColor: Color
)

@Composable
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

private fun parseToolInput(input: kotlinx.serialization.json.JsonObject): Map<String, Any> {
    val result = mutableMapOf<String, Any>()
    for ((key, value) in input) {
        result[key] = jsonElementToValue(value)
    }
    return result
}

private fun jsonElementToValue(element: kotlinx.serialization.json.JsonElement): Any {
    return when {
        element is kotlinx.serialization.json.JsonNull -> ""
        element is kotlinx.serialization.json.JsonPrimitive -> {
            val prim = element
            if (prim.isString) {
                prim.content
            } else if (prim.content.toBooleanStrictOrNull() != null) {
                prim.content.toBooleanStrict()
            } else {
                prim.content.toDoubleOrNull() ?: prim.content
            }
        }
        element is kotlinx.serialization.json.JsonArray -> {
            element.map { jsonElementToValue(it) }
        }
        element is kotlinx.serialization.json.JsonObject -> {
            element.keys.associateWith { jsonElementToValue(element[it]!!) }
        }
        else -> element.toString()
    }
}

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

private fun formatToolInput(input: Map<String, Any>): String {
    return try {
        val json = JsonPool.getJson()
        val jsonObject = kotlinx.serialization.json.JsonObject(
            input.entries.associate { it.key to kotlinx.serialization.json.JsonPrimitive(it.value.toString()) }
        )
        json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), jsonObject)
    } catch (e: Exception) {
        input.toString()
    }
}

private fun formatToolOutput(output: kotlinx.serialization.json.JsonElement?): String {
    if (output == null) return ""
    return try {
        val json = JsonPool.getJson()
        when (output) {
            is kotlinx.serialization.json.JsonObject -> {
                json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), output)
            }
            is kotlinx.serialization.json.JsonArray -> {
                json.encodeToString(kotlinx.serialization.json.JsonArray.serializer(), output)
            }
            is kotlinx.serialization.json.JsonPrimitive -> {
                output.content
            }
            else -> output.toString()
        }
    } catch (e: Exception) {
        output.toString()
    }
}

/**
 * 极简版工具调用卡片 - 单行显示，类似图2风格
 */
@Composable
fun CompactToolCallCard(
    toolCall: ToolCall,
    modifier: Modifier = Modifier,
    expanded: Boolean = false,
    onExpandedChange: (Boolean) -> Unit = {},
    onRetry: () -> Unit = {}
) {
    val statusConfig = getStatusConfig(toolCall.status)

    val parsedInput by remember(toolCall.id, toolCall.toolInput) {
        derivedStateOf {
            val inputMap = parseToolInput(toolCall.toolInput)
            val formattedInput = if (inputMap.isNotEmpty()) formatToolInput(inputMap) else ""
            Pair(inputMap, formattedInput)
        }
    }

    val formattedOutput by remember(toolCall.id, toolCall.toolOutput, toolCall.status) {
        derivedStateOf {
            if (toolCall.toolOutput != null &&
                (toolCall.status == "completed" || toolCall.status == "error")) {
                formatToolOutput(toolCall.toolOutput)
            } else {
                ""
            }
        }
    }

    val statusColor = when (toolCall.status) {
        "completed" -> AppColor.Success
        "error" -> AppColor.Error
        "executing" -> AppColor.Warning
        else -> AppColor.TextSecondary
    }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse_compact")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_alpha_compact"
    )

    val statusDotColor = if (toolCall.status == "executing") {
        statusColor.copy(alpha = pulseAlpha)
    } else {
        statusColor
    }

    // 极简风格：灰色圆角背景，单行显示，屏幕宽度
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { onExpandedChange(!expanded) }
            ),
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFF0F0F0),
        border = null
    ) {
        Column {
            // 极简单行标题栏：Bash • 完成 ▼
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // 工具名称
                    Text(
                        text = toolCall.toolName,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = AppColor.TextPrimary
                    )

                    // 中间圆点分隔符
                    Text(
                        text = "•",
                        fontSize = 13.sp,
                        color = AppColor.TextSecondary
                    )

                    // 状态（带颜色圆点）
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(5.dp)
                                .background(statusDotColor, shape = CircleShape)
                        )
                        Text(
                            text = statusConfig.label,
                            fontSize = 12.sp,
                            color = statusColor,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                // 下拉箭头
                Icon(
                    imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "收起" else "展开",
                    tint = AppColor.TextSecondary,
                    modifier = Modifier.size(18.dp)
                )
            }

            // 展开内容（极简风格）
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(
                    animationSpec = tween(200, easing = FastOutSlowInEasing)
                ) + fadeIn(animationSpec = tween(150)),
                exit = shrinkVertically(
                    animationSpec = tween(200, easing = FastOutSlowInEasing)
                ) + fadeOut(animationSpec = tween(150))
            ) {
                Column(
                    modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 10.dp)
                ) {
                    HorizontalDivider(
                        color = Color(0xFFE0E0E0),
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    val (inputMap, formattedInput) = parsedInput
                    if (inputMap.isNotEmpty()) {
                        MinimalResultSection(
                            title = "输入",
                            content = formattedInput,
                            isError = false
                        )

                        Spacer(modifier = Modifier.height(6.dp))
                    }

                    if (formattedOutput.isNotEmpty()) {
                        MinimalResultSection(
                            title = "输出",
                            content = formattedOutput,
                            isError = toolCall.status == "error"
                        )

                        Spacer(modifier = Modifier.height(6.dp))
                    }

                    if (toolCall.error != null && toolCall.status == "error") {
                        MinimalResultSection(
                            title = "错误",
                            content = toolCall.error,
                            isError = true
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MinimalResultSection(
    title: String,
    content: String,
    isError: Boolean
) {
    Column {
        Text(
            text = title,
            fontSize = 11.sp,
            color = AppColor.TextSecondary,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 4.dp)
        )

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(6.dp),
            color = if (isError) AppColor.ErrorBackground.copy(alpha = 0.5f) else Color(0xFFE8E8E8)
        ) {
            Text(
                text = content,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                color = if (isError) AppColor.Error else AppColor.TextPrimary,
                modifier = Modifier.padding(8.dp),
                lineHeight = 14.sp
            )
        }
    }
}

@Composable
private fun CompactResultSection(
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
                Text(text = titleIcon, fontSize = 11.sp)
                Text(
                    text = title,
                    fontWeight = FontWeight.Medium,
                    fontSize = 11.sp,
                    color = AppColor.TextPrimary
                )
            }
            Text(
                text = metaText,
                fontSize = 9.sp,
                color = AppColor.TextSecondary
            )
        }

        Spacer(modifier = Modifier.height(6.dp))

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(6.dp),
            color = Color(0xFFF5F5F7)
        ) {
            Text(
                text = content,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                color = contentColor,
                modifier = Modifier.padding(10.dp),
                lineHeight = 14.sp
            )
        }
    }
}

@Composable
private fun UltraCompactResultSection(
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
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = titleIcon, fontSize = 9.sp)
                Text(
                    text = title,
                    fontWeight = FontWeight.Medium,
                    fontSize = 9.sp,
                    color = AppColor.TextPrimary
                )
            }
            Text(
                text = metaText,
                fontSize = 8.sp,
                color = AppColor.TextSecondary
            )
        }

        Spacer(modifier = Modifier.height(4.dp))

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(4.dp),
            color = Color(0xFFF5F5F7)
        ) {
            Text(
                text = content,
                fontFamily = FontFamily.Monospace,
                fontSize = 8.sp,
                color = contentColor,
                modifier = Modifier.padding(8.dp),
                lineHeight = 12.sp
            )
        }
    }
}
