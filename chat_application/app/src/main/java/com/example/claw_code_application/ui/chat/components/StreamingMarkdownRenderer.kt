package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

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
 * 性能对比：
 * - 旧方案：每次更新全量重解析 + 全量重组 → O(n) 每帧
 * - 新方案：只解析活跃块 + 只重组活跃块 → O(1) 每帧
 *
 * @param content 当前完整的 Markdown 文本
 * @param modifier Compose 修饰符
 */
@Composable
fun StreamingMarkdownRenderer(
    content: String,
    modifier: Modifier = Modifier
) {
    val parser = remember { IncrementalMarkdownParser() }

    val blocks = remember(content) { parser.update(content) }

    DisposableEffect(Unit) {
        onDispose { parser.reset() }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        blocks.forEach { block ->
            key(block.id) {
                BeautifulMarkdown(
                    markdown = block.content,
                    isStreaming = !block.isStable,
                    modifier = Modifier.padding(vertical = 2.dp)
                )
            }
        }
    }
}
