package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownColor
import com.mikepenz.markdown.m3.markdownTypography
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 超美Markdown渲染组件 - Manus 1.6 Lite 风格
 *
 * 基于 mikepenz/multiplatform-markdown-renderer 库
 * 特性：
 * - Material Design 3 原生风格
 * - 代码语法高亮（支持50+语言）
 * - 表格渲染
 * - 自定义配色方案（iOS蓝 + 柔和灰）
 * - 流式输出优化（retainState避免闪烁）
 *
 * @param markdown Markdown文本内容
 * @param isStreaming 是否正在流式输出（优化性能）
 * @param modifier Compose修饰符
 */
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    /**
     * 自定义Material3 Markdown样式 - Manus 1.6 Lite 配色
     */
    val markdownTypography = markdownTypography {
        h1 = TextStyle(
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = AppColor.TextPrimary,
            lineHeight = 36.sp
        )
        h2 = TextStyle(
            fontSize = 24.sp,
            fontWeight = FontWeight.SemiBold,
            color = AppColor.TextPrimary,
            lineHeight = 32.sp
        )
        h3 = TextStyle(
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            color = AppColor.TextPrimary,
            lineHeight = 28.sp
        )
        h4 = TextStyle(
            fontSize = 18.sp,
            fontWeight = FontWeight.Medium,
            color = AppColor.TextPrimary,
            lineHeight = 26.sp
        )
        h5 = TextStyle(
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            color = AppColor.TextPrimary,
            lineHeight = 24.sp
        )
        h6 = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = AppColor.TextSecondary,
            lineHeight = 22.sp
        )

        paragraph = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontSize = 15.sp,
            color = AppColor.TextPrimary,
            lineHeight = 23.sp // Manus标准行高1.55倍
        )

        code = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontSize = 13.sp,
            color = Color(0xFFE83E8C), // 粉红色代码（Dracula主题）
            background = Color(0xFF282A36), // 深色背景
            lineHeight = 20.sp
        )

        inlineCode = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontSize = 13.sp,
            color = Color(0xFFE83E8C),
            background = Color(0xFFF5F5F7), // 浅灰背景（与气泡一致）
            lineHeight = 20.sp
        )

       blockquote = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontSize = 14.sp,
            color = AppColor.TextSecondary,
            lineHeight = 22.sp
        )

        list = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontSize = 15.sp,
            color = AppColor.TextPrimary,
            lineHeight = 23.sp
        )

        orderedItem = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontSize = 15.sp,
            color = AppColor.TextPrimary,
            lineHeight = 23.sp
        )

        item = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontSize = 15.sp,
            color = AppColor.TextPrimary,
            lineHeight = 23.sp
        )
    }

    /**
     * 自定义颜色配置 - iOS系统蓝为主色调
     */
    val markdownColors = markdownColor(
        text = AppColor.TextPrimary,
        background = Color.Transparent, // 透明背景（由外部气泡控制）
        linkColor = Color(0xFF007AFF), // iOS系统蓝（Manus风格）

        // 代码块配色（Dracula主题变体）
        codeBackground = Color(0xFF282A36),
        codeColor = Color(0xFFF8F8F2),

        inlineCodeBackground = Color(0xFFF0F0F2),
        inlineCodeColor = Color(0xFFE83E8C),

        // 语法高亮颜色
        headingColor = AppColor.TextPrimary,
        strongColor = AppColor.TextPrimary,

        // 列表颜色
        listBulletColor = AppColor.PrimaryLight,
        orderedListTextColor = AppColor.TextPrimary,
        unorderedListTextColor = AppColor.TextPrimary
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
    ) {
        Markdown(
            content = markdown,
            typography = markdownTypography,
            colors = markdownColors,
            // 流式输出时保留旧内容，避免闪烁
            retainState = isStreaming,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
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
