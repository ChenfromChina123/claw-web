package com.example.claw_code_application.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * 应用颜色定义 - Manus 1.6 Lite 风格
 * 
 * 设计理念：
 * - 极简、克制、专业，像原生系统应用
 * - 视觉元素统一，无多余装饰
 * - 浅色主题为主，深色模式完整适配
 */
object AppColor {
    // ==================== 浅色主题 ====================
    // Manus 1.6 Lite 核心配色

    /** 主色：纯黑 - 用于用户消息气泡、重要文字 */
    val Primary = Color(0xFF000000)
    
    /** 主色强调：iOS系统蓝 - 用于链接、重点强调 */
    val PrimaryLight = Color(0xFF007AFF)
    
    /** 浅灰色背景 - iOS系统浅灰色，最接近纸张的颜色 */
    val BackgroundDark = Color(0xFFF7F7F7)
    
    /** 卡片/气泡背景：纯白 */
    val SurfaceDark = Color(0xFFFFFFFF)
    
    /** 浅灰表面：用于次级背景、输入框等 */
    val SurfaceLight = Color(0xFFF0F0F0)
    
    /** 代码/关键词标签背景：浅灰 */
    val CodeBackground = Color(0xFFE8E8ED)
    
    /** 主文字颜色：深灰黑 */
    val TextPrimary = Color(0xFF1A1A1A)
    
    /** 次要文字颜色：中灰 */
    val TextSecondary = Color(0xFF757575)
    
    /** 成功色：绿色 */
    val Success = Color(0xFF10B981)
    
    /** 错误色：红色 */
    val Error = Color(0xFFEF4444)
    
    /** 警告色：橙色 */
    val Warning = Color(0xFFF59E0B)
    
    /** 信息色：蓝色 */
    val Info = Color(0xFF3B82F6)

    // ==================== 消息气泡 ====================
    // Manus 核心样式：轻、透、统一

    /** 用户消息气泡：纯黑 */
    val UserBubbleBackground = Color(0xFF000000)
    
    /** AI消息气泡：纯白 + 极淡阴影 */
    val AssistantBubbleBackground = Color(0xFFFFFFFF)
    
    /** 边框色：极浅灰 */
    val Border = Color(0xFFEAEAEA)
    
    /** 分割线颜色 */
    val Divider = Color(0xFFEAEAEA)

    // ==================== 任务步骤 ====================
    val TaskCompleted = Color(0xFFAAAAAA)
    val TaskIconBorder = Color(0xFFCCCCCC)

    // ==================== 提示块样式 ====================
    // 成功提示：浅绿背景 + 深绿文字
    val SuccessBackground = Color(0xFFE8F5E9)
    val SuccessText = Color(0xFF2E7D32)
    
    // 错误提示：浅红背景 + 深红文字
    val ErrorBackground = Color(0xFFFFEBEE)
    val ErrorText = Color(0xFFC62828)
    
    // 警告提示：浅橙背景 + 深橙文字
    val WarningBackground = Color(0xFFFFF3E0)
    val WarningText = Color(0xFFEF6C00)
    
    // 信息提示：浅蓝背景 + 深蓝文字
    val InfoBackground = Color(0xFFE3F2FD)
    val InfoText = Color(0xFF1976D2)

    // ==================== 暗色主题 ====================
    // 基于 Manus Web 端 variables.css 的深色配色

    val DarkPrimary = Color(0xFF6366F1)
    val DarkOnPrimary = Color(0xFFFFFFFF)
    val DarkPrimaryContainer = Color(0xFF1E1B4B)
    val DarkOnPrimaryContainer = Color(0xFFC7D2FE)

    val DarkSecondary = Color(0xFF818CF8)
    val DarkOnSecondary = Color(0xFF1E1B4B)

    val DarkBackground = Color(0xFF0A0A0F)
    val DarkOnBackground = Color(0xFFF8FAFC)

    val DarkSurface = Color(0xFF13131A)
    val DarkOnSurface = Color(0xFFF8FAFC)
    val DarkSurfaceVariant = Color(0xFF16161E)
    val DarkOnSurfaceVariant = Color(0xFF94A3B8)

    val DarkError = Color(0xFFF87171)
    val DarkOnError = Color(0xFF1C1917)

    val DarkOutline = Color(0xFF2D2D3A)

    val DarkUserBubbleBackground = Color(0xFF6366F1)
    val DarkAssistantBubbleBackground = Color(0xFF16161E)
    val DarkBorder = Color(0xFF2D2D3A)
    val DarkDivider = Color(0xFF2D2D3A)
    val DarkTextPrimary = Color(0xFFF8FAFC)
    val DarkTextSecondary = Color(0xFF94A3B8)
    
    // 暗色代码背景
    val DarkCodeBackground = Color(0xFF1E1E1E)
    
    // 暗色成功/错误提示
    val DarkSuccessBackground = Color(0xFF064E3B)
    val DarkSuccessText = Color(0xFF34D399)
    val DarkErrorBackground = Color(0xFF7F1D1D)
    val DarkErrorText = Color(0xFFFCA5A5)
}
