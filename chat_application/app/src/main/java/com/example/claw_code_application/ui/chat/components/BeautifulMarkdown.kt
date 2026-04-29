package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.model.DefaultMarkdownAnnotatedStringFactory
import com.mikepenz.markdown.model.MarkdownElement

/**
 * 完全优化版 Manus 风格 Markdown 渲染组件
 * 应用自定义颜色和字体，美化代码块，支持流式输出
 */
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    val colors = markdownColors()
    val typography = markdownTypography()
    val clipboardManager = LocalClipboardManager.current
    val codeScrollState = rememberScrollState()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MarkdownConfig.codeBlockCornerRadius))
    ) {
        Markdown(
            content = markdown,
            colors = colors,
            typography = typography,
            listIndent = MarkdownConfig.listIndent,
            paragraphSpacing = MarkdownConfig.paragraphSpacing,
            codeBlock = { code: String, language: String? ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clip(RoundedCornerShape(MarkdownConfig.codeBlockCornerRadius))
                        .background(colors.codeBackground)
                ) {
                    if (!language.isNullOrBlank() || !isStreaming) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (!language.isNullOrBlank()) {
                                androidx.compose.material3.Text(
                                    text = language.lowercase(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = colors.text.copy(alpha = 0.6f)
                                )
                            }

                            if (!isStreaming) {
                                Box(modifier = Modifier.weight(1f))
                                IconButton(
                                    onClick = { clipboardManager.setText(AnnotatedString(code)) },
                                    modifier = Modifier.size(20.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.ContentCopy,
                                        contentDescription = "复制代码",
                                        tint = colors.text.copy(alpha = 0.6f)
                                    )
                                }
                            }
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(codeScrollState)
                            .padding(
                                horizontal = MarkdownConfig.codeBlockPadding,
                                vertical = if (language.isNullOrBlank()) 12.dp else 0.dp
                            )
                            .padding(bottom = 12.dp)
                    ) {
                        androidx.compose.material3.Text(
                            text = code,
                            style = typography.code,
                            color = colors.codeText
                        )
                    }
                }
            },
            inlineCode = { text: String ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(colors.inlineCodeBackground)
                        .padding(horizontal = 4.dp, vertical = 2.dp)
                ) {
                    androidx.compose.material3.Text(
                        text = text,
                        style = typography.inlineCode,
                        color = colors.inlineCodeText
                    )
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp)
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
