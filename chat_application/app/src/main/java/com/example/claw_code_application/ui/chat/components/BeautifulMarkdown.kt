package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.isSystemInDarkTheme
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
import com.mikepenz.markdown.compose.components.markdownComponents
import com.mikepenz.markdown.compose.extendedspans.ExtendedSpans
import com.mikepenz.markdown.compose.extendedspans.RoundedCornerSpanPainter
import com.mikepenz.markdown.compose.elements.highlightedCodeBlock
import com.mikepenz.markdown.compose.elements.highlightedCodeFence
import com.mikepenz.markdown.model.DefaultMarkdownExtendedSpans

/**
 * Manus 风格 Markdown 渲染组件 - 优化版
 * 集成自定义颜色、字体排版、代码语法高亮和扩展样式
 * 支持表格渲染、代码语法高亮、圆角行内代码样式
 *
 * 优化点：
 * 1. 缓存MarkdownTable.createComponents()结果，减少计算开销
 * 2. 扩展span配置使用remember缓存
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

    // markdownColor和markdownTypography是@Composable函数，不能直接缓存
    // 但它们内部只是创建数据对象，开销较小
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

    // 缓存table组件，避免每次重组重新创建
    val tableComponents = remember { MarkdownTable.createComponents() }

    // 组件配置 - highlightedCodeBlock/highlightedCodeFence是@Composable函数引用
    val components = markdownComponents(
        codeBlock = highlightedCodeBlock,
        codeFence = highlightedCodeFence,
        table = tableComponents.table
    )

    // 扩展span配置不需要频繁变化，使用remember缓存
    val extendedSpans = remember {
        DefaultMarkdownExtendedSpans {
            ExtendedSpans(
                RoundedCornerSpanPainter()
            )
        }
    }

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
            components = components,
            extendedSpans = extendedSpans
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
