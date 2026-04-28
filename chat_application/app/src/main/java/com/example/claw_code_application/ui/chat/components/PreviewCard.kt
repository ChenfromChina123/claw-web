package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 预览卡片组件 - Manus 1.6 Lite 风格
 * 展示任务生成的网页或文件预览
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
        shape = RoundedCornerShape(10.dp),
        color = androidx.compose.ui.graphics.Color.White,
        border = BorderStroke(1.dp, Color(0xFFE8E8ED))
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
            .background(Color(0xFFF5F5F7).copy(alpha = 0.8f))
            .padding(horizontal = 14.dp, vertical = 10.dp),
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
            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = description,
                fontSize = 12.sp,
                color = AppColor.TextSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(
                onClick = onDashboardClick,
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.textButtonColors(
                    containerColor = Color(0xFFF5F5F7),
                    contentColor = AppColor.TextPrimary
                ),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)
            ) {
                Text(
                    text = "仪表盘",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            TextButton(
                onClick = onPreviewClick,
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.textButtonColors(
                    containerColor = AppColor.PrimaryLight,
                    contentColor = androidx.compose.ui.graphics.Color.White
                ),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)
            ) {
                Text(
                    text = "预览",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}
