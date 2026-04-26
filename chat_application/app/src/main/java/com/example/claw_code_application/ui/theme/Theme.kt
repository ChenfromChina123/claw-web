package com.example.claw_code_application.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
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
 * Claw-Code应用主题（浅色主题）
 */
@Composable
fun ClawCodeApplicationTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = LightColorScheme
    val typography = Type.createTypography()

    // 设置状态栏为白色并适配浅色主题
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = AppColor.SurfaceDark.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = true
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = typography,
        content = content
    )
}
