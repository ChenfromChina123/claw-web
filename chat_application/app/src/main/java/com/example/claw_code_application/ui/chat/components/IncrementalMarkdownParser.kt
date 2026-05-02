package com.example.claw_code_application.ui.chat.components

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
 * - 语法补全不污染原始文本，避免内容"缩回"闪烁
 *
 * 对比：
 * - 旧方案：每次更新全量重解析 → O(n) 每帧
 * - 新方案：只解析活跃块 → O(1) 每帧（活跃块通常很短）
 */
class IncrementalMarkdownParser {

    /**
     * Markdown 块
     *
     * @property id 唯一标识，用于 Compose key，保证稳定重组
     * @property rawContent 原始内容（不含语法补全，用于增量更新）
     * @property displayContent 渲染内容（活跃块已应用语法补全）
     * @property isStable 是否为已完成块（不再变化，不参与重组）
     */
    data class MarkdownBlock(
        val id: String,
        val rawContent: String,
        val displayContent: String,
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
            reset()
            return emptyList()
        }

        // 检查是否是增量更新（新文本以旧文本开头）
        // 如果不是，可能是内容被修改了，需要重置
        if (previousFullText.isNotEmpty() && !fullText.startsWith(previousFullText)) {
            // 如果不是增量更新，但内容变化不大，尝试继续
            // 只有当内容完全不一致时才重置
            if (!fullText.contains(previousFullText.take(100))) {
                reset()
            }
        }

        val newContent = if (previousFullText.isNotEmpty()) {
            fullText.substring(previousFullText.length)
        } else {
            fullText
        }

        // 只有当新内容有意义时才更新（避免空字符或仅空白字符触发更新）
        if (newContent.isNotEmpty() && newContent.isNotBlank()) {
            activeBlockRawText += newContent
        }

        val newBlocks = splitIntoBlocks(activeBlockRawText)

        when {
            newBlocks.size > 1 -> {
                for (i in 0 until newBlocks.size - 1) {
                    val blockContent = newBlocks[i]
                    stableBlocks.add(
                        MarkdownBlock(
                            id = "block_${blockCounter++}",
                            rawContent = blockContent,
                            displayContent = blockContent,
                            isStable = true
                        )
                    )
                }
                activeBlockRawText = newBlocks.last()
            }
            newBlocks.size == 1 -> {
                activeBlockRawText = newBlocks[0]
            }
            else -> {
                activeBlockRawText = ""
            }
        }

        previousFullText = fullText

        return buildResult()
    }

    /**
     * 重置解析器状态
     */
    fun reset() {
        stableBlocks.clear()
        activeBlockRawText = ""
        blockCounter = 0
        previousFullText = ""
    }

    /**
     * 构建最终结果列表
     * 稳定块保持原样，活跃块应用语法补全
     * 关键：原始文本(rawContent)和显示文本(displayContent)分离
     * 避免语法补全标记污染原始文本导致"缩回"闪烁
     */
    private fun buildResult(): List<MarkdownBlock> {
        val result = mutableListOf<MarkdownBlock>()
        result.addAll(stableBlocks)

        if (activeBlockRawText.isNotEmpty()) {
            result.add(
                MarkdownBlock(
                    id = "active",
                    rawContent = activeBlockRawText,
                    displayContent = remendSyntax(activeBlockRawText),
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
