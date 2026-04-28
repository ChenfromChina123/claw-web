package com.example.claw_code_application.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * 浅色主题配色方案 - Manus 1.6 Lite 风格
 */
private val LightColorScheme = lightColorScheme(
    primary = AppColor.Primary,
    onPrimary = Color.White,
    primaryContainer = AppColor.SurfaceLight,
    onPrimaryContainer = AppColor.TextPrimary,

    secondary = AppColor.PrimaryLight,
    onSecondary = Color.White,
    secondaryContainer = AppColor.SurfaceLight,
    onSecondaryContainer = AppColor.TextPrimary,

    tertiary = AppColor.PrimaryLight,
    onTertiary = Color.White,

    background = AppColor.BackgroundDark,
    onBackground = AppColor.TextPrimary,

    surface = AppColor.SurfaceDark,
    onSurface = AppColor.TextPrimary,
    surfaceVariant = AppColor.SurfaceLight,
    onSurfaceVariant = AppColor.TextSecondary,

    error = AppColor.Error,
    onError = Color.White,

    outline = AppColor.Border
)

/**
 * 暗色主题配色方案 - Manus 1.6 Lite 风格
 */
private val DarkColorScheme = darkColorScheme(
    primary = AppColor.DarkPrimary,
    onPrimary = AppColor.DarkOnPrimary,
    primaryContainer = AppColor.DarkPrimaryContainer,
    onPrimaryContainer = AppColor.DarkOnPrimaryContainer,

    secondary = AppColor.DarkSecondary,
    onSecondary = AppColor.DarkOnSecondary,

    tertiary = AppColor.DarkPrimary,
    onTertiary = Color.White,

    background = AppColor.DarkBackground,
    onBackground = AppColor.DarkOnBackground,

    surface = AppColor.DarkSurface,
    onSurface = AppColor.DarkOnSurface,
    surfaceVariant = AppColor.DarkSurfaceVariant,
    onSurfaceVariant = AppColor.DarkOnSurfaceVariant,

    error = AppColor.DarkError,
    onError = AppColor.DarkOnError,

    outline = AppColor.DarkOutline
)

/**
 * 应用主题 - Manus 1.6 Lite 风格
 * 
 * 支持浅色/暗色主题，跟随系统设置
 * Android 12+ 支持动态颜色
 */
@Composable
fun ClawCodeApplicationTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,  // 默认关闭动态颜色，保持Manus风格一致
    content: @Composable () -> Unit
) {
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
                window.statusBarColor = AppColor.DarkSurface.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            } else {
                window.statusBarColor = AppColor.SurfaceDark.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = true
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = typography,
        content = content
    )
}
