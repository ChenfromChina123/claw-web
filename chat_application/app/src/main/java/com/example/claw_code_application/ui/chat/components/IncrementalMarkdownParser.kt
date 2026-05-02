package com.example.claw_code_application.ui.chat.components

import android.util.Log

/**
 * 增量 Markdown 解析器
 *
 * 核心原理：
 * 1. 维护解析状态，新 Token 到来时只更新"活跃块"（最后一个 Block）
 * 2. 遇到 \n\n 或 ``` 等块边界时，才在列表末尾添加新节点
 * 3. 对活跃块自动补全悬挂语法（Syntax Remending）
 *
 * 性能优化：
 * - 历史块（stable blocks）只解析一次，不参与后续重组
 * - 只有活跃块（active block）在每次更新时重新解析
 * - 通过 key 机制确保 Compose 只重组最后一个块
 *
 * 对比：
 * - 旧方案：每次更新全量重解析 → O(n) 每帧
 * - 新方案：只解析活跃块 → O(1) 每帧（活跃块通常很短）
 */
class IncrementalMarkdownParser {

    companion object {
        private const val TAG = "IncrementalMarkdownParser"
    }

    /**
     * Markdown 块
     *
     * @property id 唯一标识，用于 Compose key，保证稳定重组
     * @property content 渲染内容（活跃块已应用语法补全）
     * @property isStable 是否为已完成块（不再变化，不参与重组）
     */
    data class MarkdownBlock(
        val id: String,
        val content: String,
        val isStable: Boolean
    )

    private val stableBlocks = mutableListOf<MarkdownBlock>()
    private var activeBlockRawText = ""
    private var blockCounter = 0
    private var previousFullText = ""

    /**
     * 更新解析器并返回当前所有块
     * 增量更新：只处理新增内容，历史块保持不变
     *
     * @param fullText 当前完整的 Markdown 文本
     * @return 块列表，最后一个块为活跃块（可能包含语法补全）
     */
    fun update(fullText: String): List<MarkdownBlock> {
        if (fullText.isEmpty()) {
            Log.d(TAG, "update: fullText is empty, resetting")
            reset()
            return emptyList()
        }

        // 检查是否需要重置 - 如果新文本不以旧文本开头，说明内容被修改了
        if (previousFullText.isNotEmpty() && !fullText.startsWith(previousFullText)) {
            Log.w(TAG, "update: CONTENT RESET triggered! " +
                    "previousLength=${previousFullText.length}, " +
                    "newLength=${fullText.length}, " +
                    "previousPrefix='${previousFullText.take(50)}...', " +
                    "newPrefix='${fullText.take(50)}...'")
            reset()
        }

        val newContent = if (previousFullText.isNotEmpty()) {
            fullText.substring(previousFullText.length)
        } else {
            fullText
        }

        Log.v(TAG, "update: newContent length=${newContent.length}, " +
                "content='${newContent.take(100)}${if (newContent.length > 100) "..." else ""}'")

        activeBlockRawText += newContent

        val newBlocks = splitIntoBlocks(activeBlockRawText)
        Log.d(TAG, "update: splitIntoBlocks returned ${newBlocks.size} blocks")

        when {
            newBlocks.size > 1 -> {
                // 有块完成，添加到稳定块列表
                for (i in 0 until newBlocks.size - 1) {
                    stableBlocks.add(
                        MarkdownBlock(
                            id = "block_${blockCounter++}",
                            content = newBlocks[i],
                            isStable = true
                        )
                    )
                    Log.d(TAG, "update: added stable block #${blockCounter - 1}, " +
                            "length=${newBlocks[i].length}")
                }
                activeBlockRawText = newBlocks.last()
                Log.d(TAG, "update: active block updated, length=${activeBlockRawText.length}")
            }
            newBlocks.size == 1 -> {
                activeBlockRawText = newBlocks[0]
                Log.v(TAG, "update: single active block, length=${activeBlockRawText.length}")
            }
            else -> {
                activeBlockRawText = ""
                Log.w(TAG, "update: no blocks returned!")
            }
        }

        previousFullText = fullText

        val result = buildResult()
        Log.d(TAG, "update: returning ${result.size} blocks total (${stableBlocks.size} stable + ${if (activeBlockRawText.isNotEmpty()) 1 else 0} active)")
        return result
    }

    /**
     * 重置解析器状态
     */
    fun reset() {
        Log.i(TAG, "reset: clearing ${stableBlocks.size} stable blocks")
        stableBlocks.clear()
        activeBlockRawText = ""
        blockCounter = 0
        previousFullText = ""
    }

    /**
     * 构建最终结果列表
     * 稳定块保持原样，活跃块应用语法补全
     */
    private fun buildResult(): List<MarkdownBlock> {
        val result = mutableListOf<MarkdownBlock>()
        result.addAll(stableBlocks)

        if (activeBlockRawText.isNotEmpty()) {
            val remendedContent = remendSyntax(activeBlockRawText)
            result.add(
                MarkdownBlock(
                    id = "active",
                    content = remendedContent,
                    isStable = false
                )
            )
        }

        return result
    }

    /**
     * 将文本按块边界分割
     * 块边界：空行、代码围栏（```）
     * 代码围栏内的空行不作为块边界
     */
    private fun splitIntoBlocks(text: String): List<String> {
        val blocks = mutableListOf<String>()
        val lines = text.lines()
        var currentBlock = mutableListOf<String>()
        var inCodeFence = false

        for (line in lines) {
            val trimmed = line.trimStart()

            if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
                if (inCodeFence) {
                    currentBlock.add(line)
                    inCodeFence = false
                    blocks.add(currentBlock.joinToString("\n"))
                    currentBlock = mutableListOf()
                } else {
                    if (currentBlock.isNotEmpty()) {
                        val blockContent = currentBlock.joinToString("\n").trim()
                        if (blockContent.isNotEmpty()) {
                            blocks.add(blockContent)
                        }
                        currentBlock = mutableListOf()
                    }
                    currentBlock.add(line)
                    inCodeFence = true
                }
                continue
            }

            if (inCodeFence) {
                currentBlock.add(line)
                continue
            }

            if (line.isBlank()) {
                if (currentBlock.isNotEmpty()) {
                    val blockContent = currentBlock.joinToString("\n").trim()
                    if (blockContent.isNotEmpty()) {
                        blocks.add(blockContent)
                    }
                    currentBlock = mutableListOf()
                }
                continue
            }

            currentBlock.add(line)
        }

        if (currentBlock.isNotEmpty()) {
            val blockContent = currentBlock.joinToString("\n").trim()
            if (blockContent.isNotEmpty()) {
                blocks.add(blockContent)
            }
        }

        return blocks
    }

    /**
     * 语法补全（Syntax Remending）
     * 为不完整的 Markdown 语法自动补全闭合标记
     * 确保渲染器始终收到合法的 Markdown 文本
     *
     * 补全规则：
     * 1. 未闭合的代码围栏 → 补全 ```
     * 2. 未闭合的粗体 → 补全 **
     * 3. 未闭合的行内代码 → 补全 `
     */
    private fun remendSyntax(text: String): String {
        var result = text

        val fenceCount = result.lines().count { it.trimStart().startsWith("```") }
        if (fenceCount % 2 != 0) {
            result += "\n```"
        }

        val boldOpenCount = Regex("""\*\*""").findAll(result).count()
        if (boldOpenCount % 2 != 0) {
            result += "**"
        }

        val inlineCodeCount = Regex("""(?<!`)`(?!`)""").findAll(result).count()
        if (inlineCodeCount % 2 != 0) {
            result += "`"
        }

        return result
    }
}
