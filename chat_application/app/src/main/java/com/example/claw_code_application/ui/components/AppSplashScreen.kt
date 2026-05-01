package com.example.claw_code_application.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 应用启动加载屏幕
 * 显示品牌标识和流畅的加载动画，避免数据加载时的界面闪烁
 *
 * @param message 加载提示文本
 */
@Composable
fun AppSplashScreen(
    message: String = "正在加载...",
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current

    val infiniteTransition = rememberInfiniteTransition(label = "splash")

    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    val dotAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "dotAlpha"
    )

    val orbitRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "orbitRotation"
    )

    val shimmerOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.Background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            OrbitalLogoAnimation(
                pulseScale = pulseScale,
                orbitRotation = orbitRotation,
                primaryColor = colors.Primary,
                surfaceColor = colors.Surface,
                onPrimaryColor = colors.OnPrimary
            )

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "收藏家",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = colors.TextPrimary,
                letterSpacing = 2.sp
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "AI 智能助手",
                fontSize = 14.sp,
                color = colors.TextSecondary,
                letterSpacing = 1.sp
            )

            Spacer(modifier = Modifier.height(40.dp))

            LoadingDotsIndicator(
                dotAlpha = dotAlpha,
                primaryColor = colors.Primary
            )

            Spacer(modifier = Modifier.height(20.dp))

            ShimmerLoadingBar(
                shimmerOffset = shimmerOffset,
                primaryColor = colors.Primary,
                surfaceVariantColor = colors.SurfaceVariant
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = message,
                fontSize = 13.sp,
                color = colors.TextSecondary.copy(alpha = 0.7f)
            )
        }
    }
}

/**
 * 轨道旋转Logo动画
 * 中心圆 + 环绕轨道粒子，体现AI智能感
 */
@Composable
private fun OrbitalLogoAnimation(
    pulseScale: Float,
    orbitRotation: Float,
    primaryColor: Color,
    surfaceColor: Color,
    onPrimaryColor: Color
) {
    Box(
        modifier = Modifier.size(100.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .scale(pulseScale)
                .background(
                    color = primaryColor,
                    shape = RoundedCornerShape(18.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "✦",
                fontSize = 28.sp,
                color = onPrimaryColor
            )
        }

        val orbitRadius = 42.dp
        for (i in 0 until 3) {
            val angle = Math.toRadians((orbitRotation + i * 120.0))
            val offsetX = kotlin.math.cos(angle) * orbitRadius.value
            val offsetY = kotlin.math.sin(angle) * orbitRadius.value

            Box(
                modifier = Modifier
                    .offset(x = offsetX.dp, y = offsetY.dp)
                    .size(8.dp)
                    .background(
                        color = primaryColor.copy(alpha = 0.6f),
                        shape = CircleShape
                    )
            )
        }

        Box(
            modifier = Modifier
                .size(88.dp)
                .background(Color.Transparent, CircleShape)
        )
    }
}

/**
 * 三点跳动加载指示器
 */
@Composable
private fun LoadingDotsIndicator(
    dotAlpha: Float,
    primaryColor: Color
) {
    val infiniteTransition = rememberInfiniteTransition(label = "dots")

    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        for (i in 0 until 3) {
            val bounceDelay by infiniteTransition.animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(400, delayMillis = i * 150, easing = EaseOut),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "bounce_$i"
            )

            Box(
                modifier = Modifier
                    .size(6.dp)
                    .alpha(if (i == 0) dotAlpha else if (i == 1) dotAlpha * 0.7f else dotAlpha * 0.5f)
                    .background(primaryColor, CircleShape)
            )
        }
    }
}

/**
 * 微光加载进度条
 */
@Composable
private fun ShimmerLoadingBar(
    shimmerOffset: Float,
    primaryColor: Color,
    surfaceVariantColor: Color
) {
    val width = 120.dp
    val height = 3.dp

    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .background(surfaceVariantColor, RoundedCornerShape(2.dp))
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxFraction(shimmerOffset.coerceIn(0f, 1f))
                .background(
                    brush = Brush.horizontalGradient(
                        colors = listOf(
                            primaryColor.copy(alpha = 0.3f),
                            primaryColor,
                            primaryColor.copy(alpha = 0.3f)
                        )
                    ),
                    shape = RoundedCornerShape(2.dp)
                )
        )
    }
}
