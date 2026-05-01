package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor
import com.mikepenz.markdown.compose.components.markdownComponents
import com.mikepenz.markdown.compose.elements.MarkdownText
import com.mikepenz.markdown.compose.elements.highlightedCodeBlock
import com.mikepenz.markdown.compose.elements.highlightedCodeFence
import org.intellij.markdown.ast.ASTNode
import org.intellij.markdown.ast.getTextInNode

/**
 * 自定义 Markdown 表格组件
 * 提供明显的表头和内容分隔，支持水平滑动，单元格内 Markdown 解析
 */
object MarkdownTable {

    /**
     * 创建带有自定义表格和代码高亮的 markdown 组件配置
     */
    @Composable
    fun createComponents() = markdownComponents(
        codeBlock = highlightedCodeBlock,
        codeFence = highlightedCodeFence,
        table = { tableData ->
            CustomTable(
                content = tableData.content,
                node = tableData.node
            )
        }
    )
}

/**
 * 自定义表格渲染组件
 * 特点：
 * - 支持水平滑动（表格宽度超出屏幕时）
 * - 表头使用深色背景
 * - 表头和内容之间有粗分隔线
 * - 单元格内支持 Markdown 解析
 * - 圆角设计
 */
@Composable
private fun CustomTable(
    content: String,
    node: ASTNode
) {
    val colors = AppColor.current

    // 解析表格内容
    val tableContent = node.getTextInNode(content).toString()
    val lines = tableContent.lines().filter { it.isNotBlank() }

    if (lines.size < 2) {
        // 回退到默认文本渲染
        MarkdownText(
            content = content,
            node = node,
            style = TextStyle(fontSize = 14.sp)
        )
        return
    }

    // 解析表头
    val headerLine = lines[0]
    val headers = parseTableRow(headerLine)

    // 跳过分隔行 (---|---)
    val dataLines = if (lines.size > 1 && lines[1].contains("---")) {
        lines.drop(2)
    } else {
        lines.drop(1)
    }

    // 计算每列的最小宽度（基于内容长度）
    val minColumnWidth = 100.dp
    val columnWidths = calculateColumnWidths(headers, dataLines, minColumnWidth)

    // 表格容器 - 支持水平滑动
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .border(1.dp, colors.Border, RoundedCornerShape(8.dp))
            .clip(RoundedCornerShape(8.dp))
            .background(colors.Surface)
            .horizontalScroll(rememberScrollState())
    ) {
        Column {
            // 表头 - 使用深色背景
            Row {
                headers.forEachIndexed { index, headerText ->
                    val isLastCell = index == headers.size - 1
                    TableCell(
                        text = headerText,
                        textStyle = TextStyle(
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.TextPrimary
                        ),
                        isLastCell = isLastCell,
                        isHeader = true,
                        borderColor = colors.Border,
                        backgroundColor = colors.SurfaceVariant.copy(alpha = 0.9f),
                        minWidth = columnWidths.getOrElse(index) { minColumnWidth },
                        modifier = Modifier
                    )
                }
            }

            // 表头和内容之间的粗分隔线
            HorizontalDivider(
                color = colors.Border.copy(alpha = 0.8f),
                thickness = 2.dp
            )

            // 数据行
            dataLines.forEachIndexed { rowIndex, line ->
                val cells = parseTableRow(line)
                Row {
                    cells.forEachIndexed { cellIndex, cellText ->
                        val isLastCell = cellIndex == cells.size - 1
                        TableCell(
                            text = cellText,
                            textStyle = TextStyle(
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Normal,
                                color = colors.TextPrimary
                            ),
                            isLastCell = isLastCell,
                            isHeader = false,
                            borderColor = colors.Border,
                            backgroundColor = if (rowIndex % 2 == 0) colors.Surface
                            else colors.SurfaceVariant.copy(alpha = 0.2f),
                            minWidth = columnWidths.getOrElse(cellIndex) { minColumnWidth },
                            modifier = Modifier
                        )
                    }
                }

                // 行间分隔线（除了最后一行）
                if (rowIndex < dataLines.size - 1) {
                    HorizontalDivider(
                        color = colors.Border.copy(alpha = 0.4f),
                        thickness = 0.5.dp
                    )
                }
            }
        }
    }
}

/**
 * 计算每列的宽度
 * 基于表头和数据行的内容长度
 */
private fun calculateColumnWidths(
    headers: List<String>,
    dataLines: List<String>,
    minWidth: androidx.compose.ui.unit.Dp
): List<androidx.compose.ui.unit.Dp> {
    val columnCount = headers.size
    val widths = MutableList(columnCount) { minWidth }

    // 根据表头内容调整宽度
    headers.forEachIndexed { index, header ->
        val contentWidth = (header.length * 14).coerceAtLeast(100)
        widths[index] = androidx.compose.ui.unit.Dp(contentWidth.toFloat()).coerceAtLeast(minWidth)
    }

    // 根据数据行内容调整宽度
    dataLines.forEach { line ->
        val cells = parseTableRow(line)
        cells.forEachIndexed { index, cell ->
            if (index < columnCount) {
                val contentWidth = (cell.length * 12).coerceAtLeast(100)
                val cellWidth = androidx.compose.ui.unit.Dp(contentWidth.toFloat())
                widths[index] = widths[index].coerceAtLeast(cellWidth.coerceAtLeast(minWidth))
            }
        }
    }

    return widths
}

/**
 * 解析表格行
 * 处理 | 分隔的单元格
 */
private fun parseTableRow(line: String): List<String> {
    return line
        .trim()
        .trim('|')
        .split('|')
        .map { it.trim() }
        .filter { it.isNotEmpty() || line.trim().startsWith("|") }
}

/**
 * 表格单元格组件
 * 支持 Markdown 内容解析
 */
@Composable
private fun RowScope.TableCell(
    text: String,
    textStyle: TextStyle,
    isLastCell: Boolean,
    isHeader: Boolean,
    borderColor: Color,
    backgroundColor: Color,
    minWidth: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .widthIn(min = minWidth)
            .background(backgroundColor)
            .then(
                if (!isLastCell) {
                    Modifier.border(width = 0.5.dp, color = borderColor.copy(alpha = 0.5f))
                } else {
                    Modifier
                }
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        // 使用 SimpleMarkdown 渲染单元格内容，支持 Markdown 语法
        SimpleMarkdown(
            markdown = text,
            modifier = Modifier.fillMaxWidth()
        )
    }
}
