package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor
import kotlinx.coroutines.delay

/**
 * 终端查看器组件
 * 模拟 macOS 终端窗口，支持流式输出效果
 */
@Composable
fun TerminalViewer(
    command: String,
    stdout: String,
    stderr: String = "",
    exitCode: Int = 0,
    isExecuting: Boolean = false,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF1E1E1E)  // 深色终端背景
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column {
            // 终端标题栏（类似 macOS 窗口）
            TerminalTitleBar(
                title = getTerminalTitle(command),
                isExecuting = isExecuting
            )

            // 终端内容区域
            TerminalContent(
                command = command,
                stdout = stdout,
                stderr = stderr,
                exitCode = exitCode,
                isExecuting = isExecuting
            )
        }
    }
}

/**
 * 终端标题栏
 */
@Composable
private fun TerminalTitleBar(
    title: String,
    isExecuting: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF2D2D2D))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            // macOS 风格的红黄绿圆点
            TerminalWindowButton(color = Color(0xFFFF5F56))  // 关闭
            TerminalWindowButton(color = Color(0xFFFFBD2E))  // 最小化
            TerminalWindowButton(color = Color(0xFF27C93F))  // 最大化
        }

        // 标题
        Text(
            text = title,
            fontSize = 12.sp,
            color = Color(0xFFCCCCCC),
            fontWeight = FontWeight.Medium
        )

        // 执行状态
        if (isExecuting) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // 脉冲动画点
                val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                val alpha by infiniteTransition.animateFloat(
                    initialValue = 1f,
                    targetValue = 0.3f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(800, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "pulse"
                )

                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            color = AppColor.Warning.copy(alpha = alpha),
                            shape = CircleShape
                        )
                )

                Text(
                    text = "执行中",
                    fontSize = 10.sp,
                    color = AppColor.Warning,
                    fontWeight = FontWeight.Medium
                )
            }
        } else {
            Text(
                text = "已完成",
                fontSize = 10.sp,
                color = AppColor.Success,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

/**
 * macOS 窗口按钮
 */
@Composable
private fun TerminalWindowButton(color: Color) {
    Box(
        modifier = Modifier
            .size(12.dp)
            .background(color = color, shape = CircleShape)
    )
}

/**
 * 终端内容区域
 */
@Composable
private fun TerminalContent(
    command: String,
    stdout: String,
    stderr: String,
    exitCode: Int,
    isExecuting: Boolean
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 400.dp)  // 最大高度限制
            .verticalScroll(scrollState)
            .padding(12.dp)
    ) {
        // 命令提示符
        TerminalPrompt(command = command)

        Spacer(modifier = Modifier.height(8.dp))

        // 标准输出（流式打字机效果）
        if (stdout.isNotBlank()) {
            TypewriterText(
                text = stdout,
                color = Color(0xFF4EC9B0),  // 青色输出
                isExecuting = isExecuting
            )
        }

        // 错误输出（红色）
        if (stderr.isNotBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            TypewriterText(
                text = stderr,
                color = Color(0xFFF44747),  // 红色错误
                isExecuting = false
            )
        }

        // 退出码
        if (!isExecuting) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = if (exitCode == 0) "✓ 退出码: 0" else "✗ 退出码: $exitCode",
                fontSize = 11.sp,
                color = if (exitCode == 0) AppColor.Success else AppColor.Error,
                fontFamily = FontFamily.Monospace
            )
        }

        // 闪烁光标（执行中时）
        if (isExecuting) {
            BlinkingCursor()
        }
    }
}

/**
 * 终端命令提示符
 */
@Composable
private fun TerminalPrompt(command: String) {
    Row {
        // 用户名@主机名
        Text(
            text = "ubuntu@sandbox",
            fontSize = 12.sp,
            color = Color(0xFF4EC9B0),  // 青色
            fontFamily = FontFamily.Monospace
        )

        Text(
            text = ":~$ ",
            fontSize = 12.sp,
            color = Color(0xFFCCCCCC),
            fontFamily = FontFamily.Monospace
        )

        // 命令
        Text(
            text = command,
            fontSize = 12.sp,
            color = Color(0xFFDCDCAA),  // 黄色命令
            fontFamily = FontFamily.Monospace
        )
    }
}

/**
 * 打字机效果文本
 */
@Composable
private fun TypewriterText(
    text: String,
    color: Color,
    isExecuting: Boolean
) {
    var displayedText by remember { mutableStateOf("") }
    val lines = text.lines()

    // 如果是执行中，使用打字机效果
    if (isExecuting) {
        LaunchedEffect(text) {
            displayedText = ""
            for (char in text) {
                displayedText += char
                delay(1)  // 每个字符1ms延迟
            }
        }
    } else {
        displayedText = text
    }

    Text(
        text = displayedText,
        fontSize = 12.sp,
        color = color,
        fontFamily = FontFamily.Monospace,
        lineHeight = 16.sp
    )
}

/**
 * 闪烁光标
 */
@Composable
private fun BlinkingCursor() {
    val infiniteTransition = rememberInfiniteTransition(label = "cursor")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "cursor_blink"
    )

    Text(
        text = "▋",
        color = Color(0xFFCCCCCC),
        modifier = Modifier.alpha(alpha),
        fontSize = 12.sp,
        fontFamily = FontFamily.Monospace
    )
}

/**
 * 获取终端标题
 */
private fun getTerminalTitle(command: String): String {
    return when {
        command.contains("bash", ignoreCase = true) ||
        command.contains("sh", ignoreCase = true) -> "🐚 Bash"

        command.contains("python", ignoreCase = true) -> "🐍 Python"

        command.contains("node", ignoreCase = true) ||
        command.contains("npm", ignoreCase = true) -> "🟢 Node.js"

        command.contains("docker", ignoreCase = true) -> "🐳 Docker"

        command.contains("git", ignoreCase = true) -> "🔀 Git"

        else -> "💻 Terminal"
    }
}
