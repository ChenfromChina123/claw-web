package com.example.claw_code_application.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * 主题感知的应用颜色数据类
 * 
 * 所有颜色都根据当前主题（浅色/深色）动态变化
 * 
 * @property Primary 主色
 * @property PrimaryLight 主色强调
 * @property Background 背景色
 * @property Surface 卡片/气泡背景
 * @property SurfaceVariant 次级表面
 * @property TextPrimary 主文字颜色
 * @property TextSecondary 次要文字颜色
 * @property Border 边框色
 * @property Divider 分割线颜色
 * @property Success 成功色
 * @property Error 错误色
 * @property Warning 警告色
 * @property Info 信息色
 * @property UserBubbleBackground 用户消息气泡背景
 * @property AssistantBubbleBackground AI消息气泡背景
 * @property CodeBackground 代码背景
 * @property SuccessBackground 成功提示背景
 * @property SuccessText 成功提示文字
 * @property ErrorBackground 错误提示背景
 * @property ErrorText 错误提示文字
 * @property WarningBackground 警告提示背景
 * @property WarningText 警告提示文字
 * @property InfoBackground 信息提示背景
 * @property InfoText 信息提示文字
 * @property TaskCompleted 任务完成颜色
 * @property TaskIconBorder 任务图标边框
 */
data class AppColors(
    val Primary: Color,
    val PrimaryLight: Color,
    val Background: Color,
    val Surface: Color,
    val SurfaceVariant: Color,
    val TextPrimary: Color,
    val TextSecondary: Color,
    val Border: Color,
    val Divider: Color,
    val Success: Color,
    val Error: Color,
    val Warning: Color,
    val Info: Color,
    @Deprecated("用户气泡颜色已由 BubbleTheme 系统接管，请使用 BubbleThemeColors.current")
    val UserBubbleBackground: Color,
    val AssistantBubbleBackground: Color,
    val CodeBackground: Color,
    val SuccessBackground: Color,
    val SuccessText: Color,
    val ErrorBackground: Color,
    val ErrorText: Color,
    val WarningBackground: Color,
    val WarningText: Color,
    val InfoBackground: Color,
    val InfoText: Color,
    val TaskCompleted: Color,
    val TaskIconBorder: Color
)

/**
 * 浅色主题颜色配置
 * Manus 1.6 Lite 风格 - 极简、克制、专业
 */
private val LightAppColors = AppColors(
    Primary = Color(0xFF000000),
    PrimaryLight = Color(0xFF007AFF),
    Background = Color(0xFFF7F7F7),
    Surface = Color(0xFFFFFFFF),
    SurfaceVariant = Color(0xFFF0F0F0),
    TextPrimary = Color(0xFF1A1A1A),
    TextSecondary = Color(0xFF757575),
    Border = Color(0xFFEAEAEA),
    Divider = Color(0xFFEAEAEA),
    Success = Color(0xFF10B981),
    Error = Color(0xFFEF4444),
    Warning = Color(0xFFF59E0B),
    Info = Color(0xFF3B82F6),
    UserBubbleBackground = Color(0xFF000000),
    AssistantBubbleBackground = Color(0xFFFFFFFF),
    CodeBackground = Color(0xFFE8E8ED),
    SuccessBackground = Color(0xFFE8F5E9),
    SuccessText = Color(0xFF2E7D32),
    ErrorBackground = Color(0xFFFFEBEE),
    ErrorText = Color(0xFFC62828),
    WarningBackground = Color(0xFFFFF3E0),
    WarningText = Color(0xFFEF6C00),
    InfoBackground = Color(0xFFE3F2FD),
    InfoText = Color(0xFF1976D2),
    TaskCompleted = Color(0xFFAAAAAA),
    TaskIconBorder = Color(0xFFCCCCCC)
)

/**
 * 深色主题颜色配置
 * 更深的黑色背景，提高对比度
 */
private val DarkAppColors = AppColors(
    Primary = Color(0xFF6366F1),
    PrimaryLight = Color(0xFF818CF8),
    Background = Color(0xFF000000),
    Surface = Color(0xFF0D0D12),
    SurfaceVariant = Color(0xFF16161E),
    TextPrimary = Color(0xFFF8FAFC),
    TextSecondary = Color(0xFF94A3B8),
    Border = Color(0xFF1E1E2E),
    Divider = Color(0xFF1E1E2E),
    Success = Color(0xFF34D399),
    Error = Color(0xFFF87171),
    Warning = Color(0xFFFBBF24),
    Info = Color(0xFF60A5FA),
    UserBubbleBackground = Color(0xFF6366F1),
    AssistantBubbleBackground = Color(0xFF0D0D12),
    CodeBackground = Color(0xFF0A0A0F),
    SuccessBackground = Color(0xFF064E3B),
    SuccessText = Color(0xFF34D399),
    ErrorBackground = Color(0xFF7F1D1D),
    ErrorText = Color(0xFFFCA5A5),
    WarningBackground = Color(0xFF78350F),
    WarningText = Color(0xFFFCD34D),
    InfoBackground = Color(0xFF1E3A5F),
    InfoText = Color(0xFF93C5FD),
    TaskCompleted = Color(0xFF4B5563),
    TaskIconBorder = Color(0xFF374151)
)

/**
 * CompositionLocal 用于提供主题感知的颜色
 */
val LocalAppColors = staticCompositionLocalOf { LightAppColors }

/**
 * 获取当前主题的应用颜色
 * 
 * 使用方式：
 * ```kotlin
 * val colors = AppColor.current
 * Text(text = "Hello", color = colors.TextPrimary)
 * ```
 */
object AppColor {
    val current: AppColors
        @Composable
        @ReadOnlyComposable
        get() = LocalAppColors.current

    // 向后兼容的别名 - 这些直接委托给 current
    val Primary: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Primary
    
    val PrimaryLight: Color
        @Composable
        @ReadOnlyComposable
        get() = current.PrimaryLight
    
    val Background: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Background
    
    val Surface: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Surface
    
    val SurfaceVariant: Color
        @Composable
        @ReadOnlyComposable
        get() = current.SurfaceVariant
    
    val TextPrimary: Color
        @Composable
        @ReadOnlyComposable
        get() = current.TextPrimary
    
    val TextSecondary: Color
        @Composable
        @ReadOnlyComposable
        get() = current.TextSecondary
    
    val Border: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Border
    
    val Divider: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Divider
    
    val Success: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Success
    
    val Error: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Error
    
    val Warning: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Warning
    
    val Info: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Info
    
    @Deprecated("用户气泡颜色已由 BubbleTheme 系统接管，请使用 BubbleThemeColors.current")
    val UserBubbleBackground: Color
        @Composable
        @ReadOnlyComposable
        get() = current.UserBubbleBackground
    
    val AssistantBubbleBackground: Color
        @Composable
        @ReadOnlyComposable
        get() = current.AssistantBubbleBackground
    
    val CodeBackground: Color
        @Composable
        @ReadOnlyComposable
        get() = current.CodeBackground
    
    val SuccessBackground: Color
        @Composable
        @ReadOnlyComposable
        get() = current.SuccessBackground
    
    val SuccessText: Color
        @Composable
        @ReadOnlyComposable
        get() = current.SuccessText
    
    val ErrorBackground: Color
        @Composable
        @ReadOnlyComposable
        get() = current.ErrorBackground
    
    val ErrorText: Color
        @Composable
        @ReadOnlyComposable
        get() = current.ErrorText
    
    val WarningBackground: Color
        @Composable
        @ReadOnlyComposable
        get() = current.WarningBackground
    
    val WarningText: Color
        @Composable
        @ReadOnlyComposable
        get() = current.WarningText
    
    val InfoBackground: Color
        @Composable
        @ReadOnlyComposable
        get() = current.InfoBackground
    
    val InfoText: Color
        @Composable
        @ReadOnlyComposable
        get() = current.InfoText
    
    val TaskCompleted: Color
        @Composable
        @ReadOnlyComposable
        get() = current.TaskCompleted
    
    val TaskIconBorder: Color
        @Composable
        @ReadOnlyComposable
        get() = current.TaskIconBorder
    
    // 向后兼容的旧颜色名
    val SurfaceDark: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Surface
    
    val BackgroundDark: Color
        @Composable
        @ReadOnlyComposable
        get() = current.Background
    
    val SurfaceLight: Color
        @Composable
        @ReadOnlyComposable
        get() = current.SurfaceVariant
}

/**
 * 根据主题获取应用颜色
 * 
 * @param darkTheme 是否为深色主题
 * @return 对应主题的颜色配置
 */
fun getAppColors(darkTheme: Boolean): AppColors {
    return if (darkTheme) DarkAppColors else LightAppColors
}
