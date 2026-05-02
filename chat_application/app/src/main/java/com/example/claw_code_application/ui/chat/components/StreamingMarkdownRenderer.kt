package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * 流式 Markdown 渲染器
 *
 * 渲染策略：输出-渲染-固定
 * - 活跃块（正在生成）：即时渲染，高度随内容增长
 * - 稳定块（已完成）：通过 key 锁定，Compose 不再重组，绝对固定
 * - 不使用 animateContentSize，避免高度动画导致的弹跳
 *
 * 核心优化：
 * 1. 增量解析状态机：只有活跃块参与重组，稳定块 GPU 缓存
 * 2. 悬挂语法补全：代码块/加粗等未闭合时自动补全，避免原始标记外泄
 * 3. 高度塌陷防护：活跃块预设 minHeight，避免结构切换时从0突变
 * 4. 渲染防抖：流式时 80ms 合并高频 token，非流式时直接渲染
 *
 * @param content 当前完整的 Markdown 文本
 * @param isStreaming 是否正在流式输出，影响防抖策略
 * @param modifier Compose 修饰符
 */
@Composable
fun StreamingMarkdownRenderer(
    content: String,
    isStreaming: Boolean = true,
    modifier: Modifier = Modifier
) {
    val parser = remember { IncrementalMarkdownParser() }

    val debouncedContent = remember { mutableStateOf(content) }

    if (isStreaming) {
        LaunchedEffect(content) {
            delay(80)
            debouncedContent.value = content
        }
    } else {
        LaunchedEffect(content) {
            debouncedContent.value = content
        }
    }

    val blocks = remember(debouncedContent.value) { parser.update(debouncedContent.value) }

    DisposableEffect(Unit) {
        onDispose { parser.reset() }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        blocks.forEach { block ->
            key(block.id) {
                val blockModifier = if (!block.isStable) {
                    val minHeight = predictMinHeight(block.content)
                    Modifier
                        .padding(vertical = 2.dp)
                        .heightIn(min = minHeight)
                } else {
                    Modifier.padding(vertical = 2.dp)
                }

                BeautifulMarkdown(
                    markdown = block.content,
                    isStreaming = !block.isStable,
                    modifier = blockModifier
                )
            }
        }
    }
}

/**
 * 根据内容类型预测活跃块的最小高度
 * 防止 Markdown 结构切换时（如文本→列表→表格）高度从0突变
 */
private fun predictMinHeight(content: String): Dp {
    val trimmed = content.trimStart()
    return when {
        trimmed.startsWith("```") || trimmed.startsWith("~~~") -> 80.dp
        trimmed.contains("|") && trimmed.contains("---") -> 60.dp
        trimmed.lines().any { it.trimStart().let { l -> l.startsWith("- ") || l.startsWith("* ") || l.startsWith("+ ") } } -> 48.dp
        trimmed.lines().any { it.trimStart().let { l -> l.startsWith(">") } } -> 40.dp
        trimmed.lines().any { it.trimStart().let { l -> l.startsWith("#") } } -> 36.dp
        trimmed.lines().any { it.trimStart().let { l -> Regex("^\\d+\\.").containsMatchIn(l) } } -> 48.dp
        else -> 24.dp
    }
}
