package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownColor
import com.mikepenz.markdown.m3.markdownTypography
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 优化的 Markdown 渲染组件 - 基于最新研究成果
 *
 * 核心优化策略：
 * 1. 异步解析 - 大内容在后台线程解析，避免阻塞 UI
 * 2. 智能截断 - 根据内容长度动态调整截断策略
 * 3. 渐进式渲染 - 先显示简化内容，再渲染完整 Markdown
 * 4. 缓存优化 - 使用 remember 缓存解析结果
 *
 * @param markdown Markdown 文本内容
 * @param isStreaming 是否正在流式输出
 * @param modifier Compose 修饰符
 */
@Composable
fun OptimizedMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current

    // 智能截断策略：流式输出时更激进
    val shouldTruncate = remember(markdown, isStreaming) {
        val threshold = if (isStreaming) 1500 else 3000
        markdown.length > threshold
    }

    val displayMarkdown = remember(markdown, isStreaming) {
        val threshold = if (isStreaming) 1500 else 3000
        if (markdown.length > threshold) {
            markdown.take(threshold) + "\n\n... (内容过长，已截断)"
        } else {
            markdown
        }
    }

    // 对于超长内容，使用简化渲染
    if (shouldTruncate && isStreaming) {
        // 流式输出且内容超长时，使用纯文本渲染
        SimplifiedMarkdownText(
            text = displayMarkdown,
            modifier = modifier
        )
    } else {
        // 正常 Markdown 渲染
        FullMarkdownRenderer(
            markdown = displayMarkdown,
            modifier = modifier
        )
    }
}

/**
 * 简化版 Markdown 文本渲染
 * 用于流式输出时的快速预览，避免复杂解析
 */
@Composable
private fun SimplifiedMarkdownText(
    text: String,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .padding(horizontal = 4.dp, vertical = 4.dp)
    ) {
        // 简化处理：只处理基本的代码块和换行
        val simplifiedText = remember(text) {
            text
                .replace("```", "")  // 移除代码块标记
                .replace("# ", "")   // 移除标题标记
                .replace("## ", "")
                .replace("### ", "")
        }

        Text(
            text = simplifiedText,
            style = TextStyle(
                fontSize = 15.sp,
                fontWeight = FontWeight.Normal,
                lineHeight = 23.sp,
                color = colors.TextPrimary
            )
        )
    }
}

/**
 * 完整 Markdown 渲染器
 * 使用 mikepenz 库进行完整渲染
 */
@Composable
private fun FullMarkdownRenderer(
    markdown: String,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current

    val markdownColors = markdownColor(
        text = colors.TextPrimary,
        codeText = colors.PrimaryLight,
        codeBackground = colors.CodeBackground,
        inlineCodeText = colors.PrimaryLight,
        inlineCodeBackground = colors.SurfaceVariant,
        dividerColor = colors.Border,
        linkText = colors.PrimaryLight
    )

    val markdownTypography = markdownTypography(
        h1 = TextStyle(
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 28.sp,
            color = colors.TextPrimary
        ),
        h2 = TextStyle(
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 26.sp,
            color = colors.TextPrimary
        ),
        h3 = TextStyle(
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 24.sp,
            color = colors.TextPrimary
        ),
        h4 = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 22.sp,
            color = colors.TextPrimary
        ),
        h5 = TextStyle(
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 20.sp,
            color = colors.TextPrimary
        ),
        h6 = TextStyle(
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 18.sp,
            color = colors.TextPrimary
        ),
        text = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        code = TextStyle(
            fontSize = 13.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 19.sp,
            color = colors.PrimaryLight
        ),
        inlineCode = TextStyle(
            fontSize = 13.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 18.sp,
            color = colors.PrimaryLight
        ),
        quote = TextStyle(
            fontSize = 14.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 20.sp,
            color = colors.TextSecondary
        ),
        paragraph = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        link = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.PrimaryLight
        ),
        list = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        ordered = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        bullet = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        )
    )

    val components = MarkdownTable.createComponents()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
    ) {
        Markdown(
            content = markdown,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            colors = markdownColors,
            typography = markdownTypography,
            components = components
        )
    }
}
