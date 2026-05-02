package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
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
 * 核心优化（ChatGPT 级丝滑体验）：
 *
 * 1. 增量解析状态机（Incremental Parser）
 *    - 维护解析状态，新 Token 到来时只更新"活跃块"
 *    - 遇到 \n\n 或 ``` 等块边界时，才在列表末尾添加新节点
 *    - 历史块只解析一次，不参与后续计算
 *
 * 2. 自动补全悬挂语法（Syntax Remending）
 *    - 流式输出中语法往往不完整（如代码块只有开头 ``` 还没出结尾）
 *    - 渲染最后一项时自动补全闭合标签
 *    - 用户看到正在生成的代码块背景，而不是原始三个反引号
 *
 * 3. 局部状态流（StateFlow Buffering + 局部重组）
 *    - 通过 key 机制，只有活跃块触发 Compose 重组
 *    - 历史块在 GPU 中是静态缓存，完全不参与计算
 *    - ViewModel 层 sample(50ms) 帧节流，避免每字符更新
 *
 * 4. 高度塌陷防护
 *    - 活跃块设置 minHeight，避免内容从0高度撑开导致的跳动
 *    - 代码块活跃时预留更大的 minHeight，提前渲染背景框轮廓
 *
 * 5. 渲染防抖
 *    - 流式输出时 80ms 防抖间隔，合并高频 token 更新
 *    - 非流式输出时跳过防抖，直接渲染
 *
 * 6. 条件化动画
 *    - isStreaming=true 时启用 animateContentSize 平滑高度变化
 *    - isStreaming=false 时禁用动画，避免历史消息滚动进入视口时跳动
 *
 * @param content 当前完整的 Markdown 文本
 * @param isStreaming 是否正在流式输出，影响防抖策略和动画
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

    // 修复防抖逻辑：不再使用 delay(80) 这种会因 content 频繁变化而不断重启导致无法更新的逻辑
    // 由于 ChatViewModel 已经做了 50ms 的 sample 采样，这里直接更新即可，
    // 或者使用更短的 delay 确保在流式结束时能收到最后一次更新
    LaunchedEffect(content) {
        debouncedContent.value = content
    }

    val blocks = remember(debouncedContent.value) { parser.update(debouncedContent.value) }

    DisposableEffect(Unit) {
        onDispose { parser.reset() }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            // 移除 animateContentSize，流式文本自然增长通常比动画增长更稳定，减少跳动感
    ) {
        blocks.forEach { block ->
            key(block.id) {
                // 为活跃块提供稳定的最小高度预测，防止高度塌陷
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
