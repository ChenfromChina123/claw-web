package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 代码差异编辑器组件
 * 显示文件修改的对比视图
 */
@Composable
fun CodeDiffEditor(
    fileName: String,
    originalCode: String,
    modifiedCode: String,
    language: String = "",
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("对比 (Diff)", "原版", "修改后")

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
            // 文件标题栏
            FileTitleBar(fileName = fileName, language = language)

            // Tab 切换
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.Transparent,
                contentColor = AppColor.Primary,
                modifier = Modifier.padding(horizontal = 8.dp)
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = {
                            Text(
                                text = title,
                                fontSize = 12.sp,
                                fontWeight = if (selectedTab == index)
                                    FontWeight.SemiBold else FontWeight.Normal
                            )
                        }
                    )
                }
            }

            // 内容区域
            AnimatedContent(
                targetState = selectedTab,
                transitionSpec = {
                    fadeIn(animationSpec = tween(200)) togetherWith
                    fadeOut(animationSpec = tween(150))
                },
                label = "tab_content"
            ) { tabIndex ->
                when (tabIndex) {
                    0 -> DiffView(originalCode = originalCode, modifiedCode = modifiedCode)
                    1 -> CodeView(code = originalCode, isOriginal = true)
                    2 -> CodeView(code = modifiedCode, isOriginal = false)
                }
            }
        }
    }
}

/**
 * 文件标题栏
 */
@Composable
private fun FileTitleBar(
    fileName: String,
    language: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFF5F5F5))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // 文件图标
            Text(
                text = "📄",
                fontSize = 16.sp
            )

            // 文件名
            Text(
                text = fileName,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = AppColor.TextPrimary,
                fontFamily = FontFamily.Monospace
            )
        }

        // 语言标签
        if (language.isNotBlank()) {
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = AppColor.Primary.copy(alpha = 0.1f)
            ) {
                Text(
                    text = language,
                    fontSize = 10.sp,
                    color = AppColor.Primary,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                )
            }
        }
    }
}

/**
 * Diff 对比视图
 */
@Composable
private fun DiffView(
    originalCode: String,
    modifiedCode: String
) {
    val diffLines = calculateDiff(originalCode, modifiedCode)
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 400.dp)
            .verticalScroll(scrollState)
            .padding(12.dp)
    ) {
        diffLines.forEach { diffLine ->
            DiffLineItem(diffLine = diffLine)
        }
    }
}

/**
 * 单行 Diff 项
 */
@Composable
private fun DiffLineItem(diffLine: DiffLine) {
    val backgroundColor = when (diffLine.type) {
        DiffType.ADDED -> Color(0xFFE6FFED)  // 绿色背景
        DiffType.REMOVED -> Color(0xFFFFE6E6)  // 红色背景
        DiffType.UNCHANGED -> Color.Transparent
    }

    val textColor = when (diffLine.type) {
        DiffType.ADDED -> Color(0xFF22863A)
        DiffType.REMOVED -> Color(0xFFCB2431)
        DiffType.UNCHANGED -> AppColor.TextPrimary
    }

    val prefix = when (diffLine.type) {
        DiffType.ADDED -> "+"
        DiffType.REMOVED -> "-"
        DiffType.UNCHANGED -> " "
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(backgroundColor)
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text = prefix,
            fontSize = 12.sp,
            color = textColor,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.width(16.dp)
        )

        Text(
            text = diffLine.content,
            fontSize = 12.sp,
            color = textColor,
            fontFamily = FontFamily.Monospace,
            lineHeight = 16.sp
        )
    }
}

/**
 * 代码视图（原版/修改后）
 */
@Composable
private fun CodeView(
    code: String,
    isOriginal: Boolean
) {
    val scrollState = rememberScrollState()
    val backgroundColor = if (isOriginal)
        Color(0xFFF5F5F5) else Color(0xFFF0F8FF)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 400.dp)
            .verticalScroll(scrollState)
            .background(backgroundColor)
            .padding(12.dp)
    ) {
        code.lines().forEachIndexed { index, line ->
            Row {
                // 行号
                Text(
                    text = "${index + 1}",
                    fontSize = 11.sp,
                    color = AppColor.TextSecondary,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.width(32.dp)
                )

                // 代码内容
                Text(
                    text = line,
                    fontSize = 12.sp,
                    color = AppColor.TextPrimary,
                    fontFamily = FontFamily.Monospace,
                    lineHeight = 16.sp
                )
            }
        }
    }
}

/**
 * Diff 行数据类
 */
data class DiffLine(
    val type: DiffType,
    val content: String,
    val lineNumber: Int = 0
)

/**
 * Diff 类型
 */
enum class DiffType {
    ADDED,      // 新增
    REMOVED,    // 删除
    UNCHANGED   // 未改变
}

/**
 * 计算代码差异（简单行级对比）
 */
private fun calculateDiff(original: String, modified: String): List<DiffLine> {
    val originalLines = original.lines()
    val modifiedLines = modified.lines()
    val diffLines = mutableListOf<DiffLine>()

    val maxLines = maxOf(originalLines.size, modifiedLines.size)

    for (i in 0 until maxLines) {
        val originalLine = originalLines.getOrNull(i) ?: ""
        val modifiedLine = modifiedLines.getOrNull(i) ?: ""

        when {
            originalLine == modifiedLine -> {
                diffLines.add(DiffLine(DiffType.UNCHANGED, originalLine, i + 1))
            }
            originalLine.isEmpty() && modifiedLine.isNotEmpty() -> {
                diffLines.add(DiffLine(DiffType.ADDED, modifiedLine, i + 1))
            }
            modifiedLine.isEmpty() && originalLine.isNotEmpty() -> {
                diffLines.add(DiffLine(DiffType.REMOVED, originalLine, i + 1))
            }
            else -> {
                diffLines.add(DiffLine(DiffType.REMOVED, originalLine, i + 1))
                diffLines.add(DiffLine(DiffType.ADDED, modifiedLine, i + 1))
            }
        }
    }

    return diffLines
}
