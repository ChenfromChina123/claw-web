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
import com.example.claw_code_application.ui.theme.AppColor

/**
 * Markdown渲染组件
 *
 * @param markdown Markdown文本内容
 * @param isStreaming 是否正在流式输出
 * @param modifier Compose修饰符
 */
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
    ) {
        Markdown(
            content = markdown,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
        )
    }
}

/**
 * 简化版Markdown渲染器（用于短文本）
 *
 * @param markdown Markdown内容
 * @param modifier 修饰符
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
