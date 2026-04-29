package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
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
import org.intellij.markdown.MarkdownElementTypes
import org.intellij.markdown.ast.ASTNode
import org.intellij.markdown.ast.findChildOfType
import org.intellij.markdown.ast.getTextInNode

/**
 * 自定义 Markdown 表格组件
 * 提供明显的表头和内容分隔，更好的视觉效果
 */
object MarkdownTable {

    /**
     * 创建带有自定义表格的 markdown 组件配置
     */
    @Composable
    fun createComponents() = markdownComponents(
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
 * - 表头使用深色背景
 * - 表头和内容之间有粗分隔线
 * - 单元格有边框
 * - 圆角设计
 */
@Composable
private fun CustomTable(
    content: String,
    node: ASTNode
) {
    val colors = AppColor.current

    // 查找表格节点
    val tableNode = node.findChildOfType(MarkdownElementTypes.TABLE)
        ?: node.findChildOfType(MarkdownElementTypes.GFM_TABLE)

    if (tableNode == null) {
        // 回退到默认文本渲染
        MarkdownText(
            content = content,
            node = node,
            style = TextStyle(fontSize = 14.sp)
        )
        return
    }

    // 解析表格结构
    val headerRow = tableNode.findChildOfType(MarkdownElementTypes.TABLE_HEADER)
    val allRows = tableNode.children.filter { it.type == MarkdownElementTypes.TABLE_ROW }

    if (headerRow == null) return

    val headerCells = headerRow.children.filter { it.type == MarkdownElementTypes.TABLE_CELL }
    // 数据行（排除表头行）
    val dataRows = if (allRows.firstOrNull() == headerRow) {
        allRows.drop(1)
    } else {
        allRows
    }

    // 表格容器
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .border(1.dp, colors.Border, RoundedCornerShape(8.dp))
            .clip(RoundedCornerShape(8.dp))
            .background(colors.Surface)
    ) {
        // 表头 - 使用深色背景
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.SurfaceVariant.copy(alpha = 0.8f))
                .padding(horizontal = 0.dp, vertical = 0.dp)
        ) {
            headerCells.forEachIndexed { index, cell ->
                val isLastCell = index == headerCells.size - 1
                TableCell(
                    content = content,
                    cell = cell,
                    textStyle = TextStyle(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.TextPrimary
                    ),
                    isLastCell = isLastCell,
                    isHeader = true,
                    borderColor = colors.Border,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // 表头和内容之间的粗分隔线
        HorizontalDivider(
            color = colors.Border.copy(alpha = 0.8f),
            thickness = 2.dp
        )

        // 数据行
        dataRows.forEachIndexed { rowIndex, row ->
            val cells = row.children.filter { it.type == MarkdownElementTypes.TABLE_CELL }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if (rowIndex % 2 == 0) colors.Surface
                        else colors.SurfaceVariant.copy(alpha = 0.3f)
                    )
            ) {
                cells.forEachIndexed { cellIndex, cell ->
                    val isLastCell = cellIndex == cells.size - 1
                    TableCell(
                        content = content,
                        cell = cell,
                        textStyle = TextStyle(
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Normal,
                            color = colors.TextPrimary
                        ),
                        isLastCell = isLastCell,
                        isHeader = false,
                        borderColor = colors.Border,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // 行间分隔线（除了最后一行）
            if (rowIndex < dataRows.size - 1) {
                HorizontalDivider(
                    color = colors.Border.copy(alpha = 0.4f),
                    thickness = 0.5.dp
                )
            }
        }
    }
}

/**
 * 表格单元格组件
 */
@Composable
private fun RowScope.TableCell(
    content: String,
    cell: ASTNode,
    textStyle: TextStyle,
    isLastCell: Boolean,
    isHeader: Boolean,
    borderColor: Color,
    modifier: Modifier = Modifier
) {
    val cellText = cell.getTextInNode(content).toString().trim()

    Box(
        modifier = modifier
            .then(
                if (!isLastCell) {
                    Modifier.border(end = 1.dp, color = borderColor.copy(alpha = 0.5f))
                } else {
                    Modifier
                }
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(
            text = cellText,
            style = textStyle,
            textAlign = TextAlign.Start,
            modifier = Modifier.fillMaxWidth()
        )
    }
}
