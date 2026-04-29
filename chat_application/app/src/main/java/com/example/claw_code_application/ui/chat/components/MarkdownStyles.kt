package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor
import com.mikepenz.markdown.m3.markdownColor
import com.mikepenz.markdown.m3.markdownTypography

/**
 * 优化版 Manus 风格 Markdown 颜色配置
 * 修复代码块对比度，统一深浅主题色调
 */
@Composable
fun markdownColors() = markdownColor(
    text = if (isSystemInDarkTheme()) AppColor.DarkTextPrimary else AppColor.TextPrimary,
    codeText = if (isSystemInDarkTheme()) Color(0xFFE06C75) else Color(0xFFD63384),
    codeBackground = if (isSystemInDarkTheme()) Color(0xFF1E1E1E) else Color(0xFFF5F5F7),
    inlineCodeText = if (isSystemInDarkTheme()) Color(0xFFE06C75) else Color(0xFFD63384),
    inlineCodeBackground = if (isSystemInDarkTheme()) Color(0xFF2D2D3A) else Color(0xFFE8E8ED),
    dividerColor = if (isSystemInDarkTheme()) AppColor.DarkDivider else AppColor.Divider,
    linkText = if (isSystemInDarkTheme()) Color(0xFF818CF8) else Color(0xFF007AFF),
    quoteText = if (isSystemInDarkTheme()) Color(0xFF9CA3AF) else Color(0xFF6B7280)
)

/**
 * 优化版 Manus 风格 Markdown 字体排版
 * 整体缩小字号，优化行高，更适合手机阅读
 */
@Composable
fun markdownTypography() = markdownTypography(
    h1 = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 26.sp
    ),
    h2 = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    h3 = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    h4 = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    h5 = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    h6 = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp
    ),
    text = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    code = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp
    ),
    inlineCode = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 17.sp
    ),
    quote = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp
    ),
    paragraph = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    list = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    ordered = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    bullet = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    )
)

/**
 * 全局配置常量
 */
object MarkdownConfig {
    val codeBlockCornerRadius = 12.dp
    val codeBlockPadding = 12.dp
    val listIndent = 20.dp
    val paragraphSpacing = 8.dp
}
