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
 */
class IncrementalMarkdownParser {

    companion object {
        private const val TAG = "IncrementalMarkdownParser"
        private const val ENABLE_LOG = false
    }

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
     */
    fun update(fullText: String): List<MarkdownBlock> {
        if (fullText.isEmpty()) {
            reset()
            return emptyList()
        }

        if (previousFullText.isNotEmpty() && !fullText.startsWith(previousFullText)) {
            reset()
        }

        val newContent = if (previousFullText.isNotEmpty()) {
            fullText.substring(previousFullText.length)
        } else {
            fullText
        }

        activeBlockRawText += newContent

        val newBlocks = splitIntoBlocks(activeBlockRawText)

        when {
            newBlocks.size > 1 -> {
                for (i in 0 until newBlocks.size - 1) {
                    stableBlocks.add(
                        MarkdownBlock(
                            id = "block_${blockCounter++}",
                            content = newBlocks[i],
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

    fun reset() {
        stableBlocks.clear()
        activeBlockRawText = ""
        blockCounter = 0
        previousFullText = ""
    }

    private fun buildResult(): List<MarkdownBlock> {
        val result = mutableListOf<MarkdownBlock>()
        result.addAll(stableBlocks)

        if (activeBlockRawText.isNotEmpty()) {
            result.add(
                MarkdownBlock(
                    id = "active",
                    content = remendSyntax(activeBlockRawText),
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
