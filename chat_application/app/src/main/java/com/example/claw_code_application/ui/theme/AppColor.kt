package com.example.claw_code_application.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * 应用颜色定义
 * 浅色主题：基于原型的Manus风格配色方案
 * 暗色主题：基于Manus Web端深色主题配色方案
 */
object AppColor {
    // ==================== 浅色主题 ====================

    val Primary = Color(0xFF000000)
    val PrimaryLight = Color(0xFF6366F1)
    val PrimaryDark = Color(0xFF4F46E5)

    val BackgroundDark = Color(0xFFF7F7F7)
    val SurfaceDark = Color(0xFFFFFFFF)
    val SurfaceLight = Color(0xFFF0F0F0)

    val TextPrimary = Color(0xFF1A1A1A)
    val TextSecondary = Color(0xFF757575)

    val Success = Color(0xFF10B981)
    val Error = Color(0xFFEF4444)
    val Warning = Color(0xFFF59E0B)
    val Info = Color(0xFF3B82F6)

    val UserBubbleBackground = Color(0xFF000000)
    val AssistantBubbleBackground = Color(0xFFFFFFFF)

    val Border = Color(0xFFEAEAEA)
    val Divider = Color(0xFFEAEAEA)

    val TaskCompleted = Color(0xFFAAAAAA)
    val TaskIconBorder = Color(0xFFCCCCCC)

    // ==================== 暗色主题 ====================
    // 基于Manus Web端 variables.css 的深色配色

    val DarkPrimary = Color(0xFF6366F1)              // 紫蓝色强调色
    val DarkOnPrimary = Color(0xFFFFFFFF)             // 紫蓝上的文字
    val DarkPrimaryContainer = Color(0xFF1E1B4B)      // 紫蓝容器
    val DarkOnPrimaryContainer = Color(0xFFC7D2FE)    // 紫蓝容器上的文字

    val DarkSecondary = Color(0xFF818CF8)             // 次要紫蓝色
    val DarkOnSecondary = Color(0xFF1E1B4B)           // 次要紫蓝上的文字

    val DarkBackground = Color(0xFF0A0A0F)            // 极深蓝黑主背景
    val DarkOnBackground = Color(0xFFF8FAFC)          // 主背景上的文字

    val DarkSurface = Color(0xFF13131A)               // 深蓝黑卡片背景
    val DarkOnSurface = Color(0xFFF8FAFC)             // 卡片上的文字
    val DarkSurfaceVariant = Color(0xFF16161E)        // 深灰蓝变体表面
    val DarkOnSurfaceVariant = Color(0xFF94A3B8)      // 变体表面上的文字

    val DarkError = Color(0xFFF87171)                 // 暗色错误红
    val DarkOnError = Color(0xFF1C1917)               // 错误上的文字

    val DarkOutline = Color(0xFF2D2D3A)               // 暗色边框

    val DarkUserBubbleBackground = Color(0xFF6366F1)  // 暗色用户消息背景（紫蓝色）
    val DarkAssistantBubbleBackground = Color(0xFF16161E) // 暗色AI消息背景
    val DarkBorder = Color(0xFF2D2D3A)                // 暗色边框
    val DarkDivider = Color(0xFF2D2D3A)               // 暗色分割线
    val DarkTextPrimary = Color(0xFFF8FAFC)            // 暗色主文字
    val DarkTextSecondary = Color(0xFF94A3B8)          // 暗色次要文字
}
