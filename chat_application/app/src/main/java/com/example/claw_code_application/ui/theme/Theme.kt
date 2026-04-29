package com.example.claw_code_application.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.example.claw_code_application.ui.chat.components.ThemeMode

/**
 * 根据主题模式和系统设置确定是否使用暗色主题
 * 
 * @param themeMode 用户选择的主题模式
 * @return true 表示使用暗色主题，false 表示使用浅色主题
 */
@Composable
private fun shouldUseDarkTheme(themeMode: ThemeMode): Boolean {
    return when (themeMode) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
}

/**
 * 浅色主题配色方案 - Manus 1.6 Lite 风格
 */
private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF000000),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF0F0F0),
    onPrimaryContainer = Color(0xFF1A1A1A),

    secondary = Color(0xFF007AFF),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF0F0F0),
    onSecondaryContainer = Color(0xFF1A1A1A),

    tertiary = Color(0xFF007AFF),
    onTertiary = Color.White,

    background = Color(0xFFF7F7F7),
    onBackground = Color(0xFF1A1A1A),

    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1A1A1A),
    surfaceVariant = Color(0xFFF0F0F0),
    onSurfaceVariant = Color(0xFF757575),

    error = Color(0xFFEF4444),
    onError = Color.White,

    outline = Color(0xFFEAEAEA)
)

/**
 * 暗色主题配色方案 - 更深的黑色背景
 */
private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF6366F1),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF1E1B4B),
    onPrimaryContainer = Color(0xFFC7D2FE),

    secondary = Color(0xFF818CF8),
    onSecondary = Color(0xFF1E1B4B),

    tertiary = Color(0xFF6366F1),
    onTertiary = Color.White,

    background = Color(0xFF000000),
    onBackground = Color(0xFFF8FAFC),

    surface = Color(0xFF0D0D12),
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF16161E),
    onSurfaceVariant = Color(0xFF94A3B8),

    error = Color(0xFFF87171),
    onError = Color(0xFF1C1917),

    outline = Color(0xFF1E1E2E)
)

/**
 * 应用主题 - Manus 1.6 Lite 风格
 * 
 * 支持浅色/暗色主题，可根据用户选择或系统设置切换
 * 包含平滑的主题切换动画效果
 * 
 * @param themeMode 用户选择的主题模式，默认为 SYSTEM（跟随系统）
 * @param dynamicColor 是否使用动态颜色，默认关闭以保持 Manus 风格一致
 * @param content 主题包裹的内容
 */
@Composable
fun ClawCodeApplicationTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val darkTheme = shouldUseDarkTheme(themeMode)
    
    val appColors = remember(darkTheme) { getAppColors(darkTheme) }
    
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    val typography = Type.createTypography()

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            if (darkTheme) {
                window.statusBarColor = appColors.Surface.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            } else {
                window.statusBarColor = appColors.Surface.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = true
            }
        }
    }

    CompositionLocalProvider(
        LocalAppColors provides appColors
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = typography,
            content = content
        )
    }
}
