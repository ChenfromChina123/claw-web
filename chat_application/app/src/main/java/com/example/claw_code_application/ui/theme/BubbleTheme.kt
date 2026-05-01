package com.example.claw_code_application.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * 气泡主题颜色数据类
 *
 * @property background 气泡背景色
 * @property textColor 气泡文字色
 */
data class BubbleThemeColors(
    val background: Color,
    val textColor: Color
)

/**
 * 气泡主题枚举
 *
 * 每种主题提供浅色/深色两套配色
 */
enum class BubbleTheme(
    val displayName: String,
    val lightBackground: Color,
    val darkBackground: Color,
    val textColor: Color = Color.White
) {
    CLASSIC(
        displayName = "经典黑",
        lightBackground = Color(0xFF000000),
        darkBackground = Color(0xFF6366F1)
    ),
    OCEAN(
        displayName = "海洋蓝",
        lightBackground = Color(0xFF007AFF),
        darkBackground = Color(0xFF3B82F6)
    ),
    MINT(
        displayName = "薄荷绿",
        lightBackground = Color(0xFF059669),
        darkBackground = Color(0xFF34D399)
    ),
    LAVENDER(
        displayName = "薰衣紫",
        lightBackground = Color(0xFF7C3AED),
        darkBackground = Color(0xFF8B5CF6)
    ),
    SUNSET(
        displayName = "日落橙",
        lightBackground = Color(0xFFEA580C),
        darkBackground = Color(0xFFFB923C)
    ),
    SAKURA(
        displayName = "樱花粉",
        lightBackground = Color(0xFFDB2777),
        darkBackground = Color(0xFFF472B6)
    );

    /**
     * 获取当前主题下的预览色（用于设置页圆点展示）
     */
    val previewColor: Color get() = lightBackground
}

/**
 * 根据气泡主题和深色模式获取气泡颜色
 *
 * @param bubbleTheme 气泡主题
 * @param darkTheme 是否深色模式
 * @return 气泡主题颜色
 */
fun getBubbleThemeColors(bubbleTheme: BubbleTheme, darkTheme: Boolean): BubbleThemeColors {
    val background = if (darkTheme) bubbleTheme.darkBackground else bubbleTheme.lightBackground
    return BubbleThemeColors(
        background = background,
        textColor = bubbleTheme.textColor
    )
}

/**
 * CompositionLocal 用于提供气泡主题颜色
 */
val LocalBubbleTheme = staticCompositionLocalOf { getBubbleThemeColors(BubbleTheme.OCEAN, false) }

/**
 * 获取当前气泡主题颜色的便捷对象
 *
 * 使用方式：
 * ```kotlin
 * val bubbleColors = BubbleThemeColors.current
 * Surface(color = bubbleColors.background) {
 *     Text(color = bubbleColors.textColor)
 * }
 * ```
 */
object BubbleThemeColors {
    val current: BubbleThemeColors
        @Composable
        @ReadOnlyComposable
        get() = LocalBubbleTheme.current
}

/**
 * 从字符串解析气泡主题枚举
 *
 * @param value 存储的字符串值
 * @return 对应的气泡主题，默认 OCEAN
 */
fun parseBubbleTheme(value: String): BubbleTheme {
    return try {
        BubbleTheme.valueOf(value)
    } catch (e: IllegalArgumentException) {
        BubbleTheme.OCEAN
    }
}
