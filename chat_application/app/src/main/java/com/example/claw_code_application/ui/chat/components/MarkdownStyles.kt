package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor
import com.mikepenz.markdown.m3.MarkdownColors
import com.mikepenz.markdown.m3.MarkdownTypography

/**
 * Manus 风格 Markdown 颜色配置
 */
@Composable
fun markdownColors(): MarkdownColors {
    val isDark = isSystemInDarkTheme()

    return if (isDark) {
        MarkdownColors(
            text = AppColor.DarkTextPrimary,
            codeText = Color(0xFFE06C75),
            codeBackground = Color(0xFF1E1E1E),
            inlineCodeText = Color(0xFFE06C75),
            inlineCodeBackground = Color(0xFF2D2D3A),
            dividerColor = AppColor.DarkDivider,
            tableBorderColor = Color(0xFF2D2D3A),
            linkText = Color(0xFF818CF8),
            blockquoteText = Color(0xFF94A3B8),
            blockquoteBackground = Color(0xFF16161E),
            blockquoteBorderColor = Color(0xFF2D2D3A),
            listBulletText = Color(0xFF94A3B8),
            imageText = Color.Transparent,
        )
    } else {
        MarkdownColors(
            text = AppColor.TextPrimary,
            codeText = Color(0xFFD63384),
            codeBackground = Color(0xFFF5F5F7),
            inlineCodeText = Color(0xFFD63384),
            inlineCodeBackground = Color(0xFFE8E8ED),
            dividerColor = AppColor.Divider,
            tableBorderColor = Color(0xFFE8E8ED),
            linkText = Color(0xFF007AFF),
            blockquoteText = Color(0xFF6B7280),
            blockquoteBackground = Color(0xFFF0F0F0),
            blockquoteBorderColor = Color(0xFFD1D5DB),
            listBulletText = Color(0xFF757575),
            imageText = Color.Transparent,
        )
    }
}

/**
 * Manus 风格 Markdown 字体排版配置
 */
@Composable
fun markdownTypography(): MarkdownTypography {
    val sansSerif = FontFamily.SansSerif
    val monospace = FontFamily.Monospace

    return MarkdownTypography(
        h1 = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.SemiBold,
            fontSize = 20.sp,
            lineHeight = 28.sp
        ),
        h2 = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.SemiBold,
            fontSize = 18.sp,
            lineHeight = 26.sp
        ),
        h3 = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 16.sp,
            lineHeight = 24.sp
        ),
        h4 = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 15.sp,
            lineHeight = 22.sp
        ),
        h5 = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 14.sp,
            lineHeight = 20.sp
        ),
        h6 = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 13.sp,
            lineHeight = 18.sp
        ),
        text = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        code = TextStyle(
            fontFamily = monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 13.sp,
            lineHeight = 19.sp
        ),
        inlineCode = TextStyle(
            fontFamily = monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 13.sp,
            lineHeight = 18.sp
        ),
        quote = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 14.sp,
            lineHeight = 20.sp
        ),
        paragraph = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        link = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        list = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        ordered = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        bullet = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        strong = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        em = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        strikeThrough = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        divider = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        ),
        table = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 14.sp,
            lineHeight = 20.sp
        ),
        tableHead = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            lineHeight = 20.sp
        ),
        image = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 14.sp,
            lineHeight = 20.sp
        ),
        checkbox = TextStyle(
            fontFamily = sansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 15.sp,
            lineHeight = 23.sp
        )
    )
}
