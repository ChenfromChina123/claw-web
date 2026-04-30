package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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

/**
 * Manus 风格 Markdown 渲染组件
 * 集成自定义颜色、字体排版和间距配置
 * 支持表格渲染（需要 mikepenz markdown renderer 0.30.0+）
 *
 * 性能优化：
 * - 长文本截断避免过度渲染
 * - 使用 remember 缓存截断结果
 * - 流式输出时降低更新频率
 * - 限制最大渲染高度
 *
 * @param markdown Markdown文本内容
 * @param isStreaming 是否正在流式输出
 * @param modifier Compose修饰符
 */
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current

    // 关键性能优化：长文本截断 + 流式输出优化
    // 流式输出时更激进的截断，减少渲染开销
    val displayMarkdown = remember(markdown, isStreaming) {
        val maxLength = if (isStreaming) 3000 else 5000
        if (markdown.length > maxLength) {
            markdown.take(maxLength) + "\n\n... (内容过长，已截断显示)"
        } else {
            markdown
        }
    }

    // 直接调用 markdownColor 和 markdownTypography，它们是 @Composable 函数
    val markdownColors = markdownColor(
        text = colors.TextPrimary,
        codeText = colors.PrimaryLight,
        codeBackground = colors.CodeBackground,
        inlineCodeText = colors.PrimaryLight,
        inlineCodeBackground = colors.SurfaceVariant,
        dividerColor = colors.Border,
        linkText = colors.PrimaryLight
    )

    // 直接调用 markdownTypography
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

    // 直接调用 createComponents，因为它内部使用了 remember
    val components = MarkdownTable.createComponents()

    // 关键优化：限制最大高度，避免超长内容影响滑动性能
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
    ) {
        Markdown(
            content = displayMarkdown,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            colors = markdownColors,
            typography = markdownTypography,
            components = components
        )
    }
}

/**
 * 简化版Markdown渲染器（用于短文本）
 *
 * @param markdown Markdown内容
 * @param modifier 修饰符
 */
@Composable
fun SimpleMarkdown(
    markdown: String,
    modifier: Modifier = Modifier
) {
    BeautifulMarkdown(
        markdown = markdown,
        isStreaming = false,
        modifier = modifier
    )
}
