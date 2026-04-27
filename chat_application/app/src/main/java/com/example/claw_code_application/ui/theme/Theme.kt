package com.example.claw_code_application.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * 浅色主题配色方案
 * 基于原型的Manus风格设计
 */
private val LightColorScheme = lightColorScheme(
    primary = AppColor.Primary,
    onPrimary = AppColor.SurfaceDark,
    primaryContainer = AppColor.SurfaceLight,
    onPrimaryContainer = AppColor.TextPrimary,

    secondary = AppColor.PrimaryLight,
    onSecondary = AppColor.SurfaceDark,
    secondaryContainer = AppColor.SurfaceLight,
    onSecondaryContainer = AppColor.TextPrimary,

    background = AppColor.BackgroundDark,
    onBackground = AppColor.TextPrimary,

    surface = AppColor.SurfaceDark,
    onSurface = AppColor.TextPrimary,
    surfaceVariant = AppColor.SurfaceLight,
    onSurfaceVariant = AppColor.TextSecondary,

    error = AppColor.Error,
    onError = AppColor.SurfaceDark,

    outline = AppColor.Border
)

/**
 * 暗色主题配色方案
 * 基于Manus Web端深色主题设计
 */
private val DarkColorScheme = darkColorScheme(
    primary = AppColor.DarkPrimary,
    onPrimary = AppColor.DarkOnPrimary,
    primaryContainer = AppColor.DarkPrimaryContainer,
    onPrimaryContainer = AppColor.DarkOnPrimaryContainer,

    secondary = AppColor.DarkSecondary,
    onSecondary = AppColor.DarkOnSecondary,

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
 * 应用主题
 * 支持浅色/暗色主题，跟随系统设置
 */
@Composable
fun ClawCodeApplicationTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
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
