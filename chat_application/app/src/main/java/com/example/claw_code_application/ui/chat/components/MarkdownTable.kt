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
import org.intellij.markdown.ast.ASTNode
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
                .background(colors.SurfaceVariant.copy(alpha = 0.9f))
        ) {
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
        dataLines.forEachIndexed { rowIndex, line ->
            val cells = parseTableRow(line)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if (rowIndex % 2 == 0) colors.Surface
                        else colors.SurfaceVariant.copy(alpha = 0.2f)
                    )
            ) {
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
                        borderColor = colors.Border,
                        modifier = Modifier.weight(1f)
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
 */
@Composable
private fun RowScope.TableCell(
    text: String,
    textStyle: TextStyle,
    isLastCell: Boolean,
    borderColor: Color,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .then(
                if (!isLastCell) {
                    Modifier.border(width = 1.dp, color = borderColor.copy(alpha = 0.5f))
                } else {
                    Modifier
                }
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(
            text = text,
            style = textStyle,
            textAlign = TextAlign.Start,
            modifier = Modifier.fillMaxWidth()
        )
    }
}
