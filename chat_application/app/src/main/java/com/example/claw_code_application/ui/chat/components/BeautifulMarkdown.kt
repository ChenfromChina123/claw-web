package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown

/**
 * Manus 风格 Markdown 渲染组件
 * 集成自定义颜色、字体排版和间距配置
 */
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    val colors = markdownColors()
    val typography = markdownTypography()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
    ) {
        Markdown(
            content = markdown,
            colors = colors,
            typography = typography,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp)
        )
    }
}

/**
 * 简化版Markdown渲染器（用于短文本）
 */
@Composable
fun SimpleMarkdown(
    markdown: String,
    modifier: Modifier = Modifier
) {
    BeautifulMarkdown(
        markdown = markdown,
        isStreaming = false,
        modifier = modifier
    )
}
