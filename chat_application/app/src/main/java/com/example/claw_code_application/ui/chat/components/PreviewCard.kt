package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 预览卡片组件
 * 复刻Manus原型中的网页/文件预览卡片设计
 * 嵌入在AgentTaskCard内部，展示任务生成的网页或文件预览
 *
 * @param title 预览标题
 * @param description 预览描述
 * @param headerTitle 标题栏左侧文字（如网站名称）
 * @param headerTime 标题栏右侧时间文字
 * @param onPreviewClick 预览按钮点击回调
 * @param onDashboardClick 仪表盘按钮点击回调
 */
@Composable
fun PreviewCard(
    title: String,
    description: String,
    headerTitle: String = "",
    headerTime: String = "",
    onPreviewClick: () -> Unit = {},
    onDashboardClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = AppColor.SurfaceDark,
        border = BorderStroke(1.dp, AppColor.Border)
    ) {
        Column {
            PreviewCardHeader(
                title = headerTitle,
                time = headerTime
            )

            PreviewCardBody(
                title = title,
                description = description,
                onPreviewClick = onPreviewClick,
                onDashboardClick = onDashboardClick
            )
        }
    }
}

/**
 * 预览卡片标题栏
 */
@Composable
private fun PreviewCardHeader(
    title: String,
    time: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppColor.SurfaceLight.copy(alpha = 0.6f))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 12.sp,
            color = AppColor.TextSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )

        if (time.isNotEmpty()) {
            Text(
                text = time,
                fontSize = 11.sp,
                color = AppColor.TextSecondary
            )
        }
    }
}

/**
 * 预览卡片内容区域
 */
@Composable
private fun PreviewCardBody(
    title: String,
    description: String,
    onPreviewClick: () -> Unit,
    onDashboardClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = title,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = AppColor.TextPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        if (description.isNotEmpty()) {
            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = description,
                fontSize = 12.sp,
                color = AppColor.TextSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(
                onClick = onDashboardClick,
                shape = RoundedCornerShape(6.dp),
                colors = ButtonDefaults.textButtonColors(
                    containerColor = AppColor.SurfaceLight,
                    contentColor = AppColor.TextPrimary
                ),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "仪表盘",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            TextButton(
                onClick = onPreviewClick,
                shape = RoundedCornerShape(6.dp),
                colors = ButtonDefaults.textButtonColors(
                    containerColor = AppColor.Primary,
                    contentColor = AppColor.SurfaceDark
                ),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "预览",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}
