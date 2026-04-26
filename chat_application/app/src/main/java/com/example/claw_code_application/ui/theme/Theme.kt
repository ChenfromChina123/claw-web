package com.example.claw_code_application.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * 暗色主题配色方案
 * 基于Vue前端的设计风格
 */
private val DarkColorScheme = darkColorScheme(
    primary = AppColor.Primary,
    onPrimary = AppColor.TextPrimary,
    primaryContainer = AppColor.PrimaryDark,
    onPrimaryContainer = AppColor.TextPrimary,

    secondary = AppColor.PrimaryLight,
    onSecondary = AppColor.TextPrimary,
    secondaryContainer = AppColor.SurfaceLight,
    onSecondaryContainer = AppColor.TextPrimary,

    background = AppColor.BackgroundDark,
    onBackground = AppColor.TextPrimary,

    surface = AppColor.SurfaceDark,
    onSurface = AppColor.TextPrimary,
    surfaceVariant = AppColor.SurfaceLight,
    onSurfaceVariant = AppColor.TextSecondary,

    error = AppColor.Error,
    onError = AppColor.TextPrimary,

    outline = AppColor.Border
)

/**
 * Claw-Code应用主题（强制暗色）
 */
@Composable
fun ClawCodeApplicationTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = DarkColorScheme
    val typography = Type.createTypography()

    // 设置状态栏为透明并适配暗色主题
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = AppColor.BackgroundDark.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = typography,
        content = content
    )
}
