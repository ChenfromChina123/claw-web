package com.example.claw_code_application.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * 应用字体定义 - Manus 1.6 Lite 风格
 * 
 * 设计理念：
 * - 中文：使用系统原生无衬线字体（苹方/思源黑体）
 * - 英文/数字/代码：使用等宽字体确保代码对齐
 * - 字号梯度：正文15sp，小标题16sp，注释/次要信息13sp，代码14sp
 * - 行高：正文1.55倍（移动端黄金行高）
 * - 段落间距：18sp（大于行高，形成清晰的段落分隔）
 */
object Type {
    
    // 思源黑体/苹方用于中文
    private val SansSerifFont = FontFamily.SansSerif
    
    // JetBrains Mono 等宽字体用于代码
    private val MonospaceFont = FontFamily.Monospace

    /** 创建Material3 Typography - Manus 1.6 Lite 风格 */
    fun createTypography(): Typography {
        return Typography(
            // 显示标题 - 大号展示文字
            displayLarge = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Bold,
                fontSize = 57.sp,
                lineHeight = 64.sp,  // 1.12倍
                letterSpacing = (-0.25).sp
            ),
            displayMedium = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Bold,
                fontSize = 45.sp,
                lineHeight = 52.sp  // 1.16倍
            ),
            displaySmall = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Bold,
                fontSize = 36.sp,
                lineHeight = 44.sp  // 1.22倍
            ),
            
            // 标题 - 用于页面主标题和卡片标题
            headlineLarge = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 32.sp,
                lineHeight = 40.sp  // 1.25倍
            ),
            headlineMedium = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 28.sp,
                lineHeight = 36.sp  // 1.29倍
            ),
            headlineSmall = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 24.sp,
                lineHeight = 32.sp  // 1.33倍
            ),
            
            // 标题 - 用于区块标题
            titleLarge = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 20.sp,
                lineHeight = 28.sp  // 1.4倍
            ),
            titleMedium = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Medium,
                fontSize = 16.sp,
                lineHeight = 24.sp,  // 1.5倍
                letterSpacing = 0.15.sp
            ),
            titleSmall = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Medium,
                fontSize = 14.sp,
                lineHeight = 20.sp,  // 1.43倍
                letterSpacing = 0.1.sp
            ),
            
            // 正文 - Manus核心排版区域
            // 行高1.5-1.6倍，确保阅读舒适度
            bodyLarge = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Normal,
                fontSize = 16.sp,
                lineHeight = 25.sp,  // 1.56倍 - 黄金行高
                letterSpacing = 0.5.sp
            ),
            bodyMedium = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Normal,
                fontSize = 15.sp,    // Manus标准：正文15sp
                lineHeight = 23.sp,  // 1.53倍
                letterSpacing = 0.25.sp
            ),
            bodySmall = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Normal,
                fontSize = 13.sp,    // 注释/次要信息13sp
                lineHeight = 19.sp,  // 1.46倍
                letterSpacing = 0.4.sp
            ),
            
            // 标签 - 用于按钮、徽章等
            labelLarge = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Medium,
                fontSize = 14.sp,
                lineHeight = 20.sp,  // 1.43倍
                letterSpacing = 0.1.sp
            ),
            labelMedium = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp,
                lineHeight = 16.sp,  // 1.33倍
                letterSpacing = 0.5.sp
            ),
            labelSmall = TextStyle(
                fontFamily = SansSerifFont,
                fontWeight = FontWeight.Medium,
                fontSize = 11.sp,
                lineHeight = 16.sp,  // 1.45倍
                letterSpacing = 0.5.sp
            )
        )
    }
    
    /**
     * 代码文本样式 - 用于代码块、行内代码
     */
    val CodeTextStyle = TextStyle(
        fontFamily = MonospaceFont,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp  // 1.43倍
    )
    
    /**
     * 终端文本样式 - 用于终端输出
     */
    val TerminalTextStyle = TextStyle(
        fontFamily = MonospaceFont,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp  // 1.5倍
    )
}
