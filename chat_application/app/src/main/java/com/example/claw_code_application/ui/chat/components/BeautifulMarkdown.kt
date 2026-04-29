package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownColor
import com.mikepenz.markdown.m3.markdownTypography
import org.intellij.markdown.MarkdownElementTypes
import org.intellij.markdown.ast.ASTNode
import org.intellij.markdown.ast.findChildOfType
import org.intellij.markdown.ast.getTextInNode

/**
 * Manus 风格 Markdown 渲染组件
 * 集成自定义颜色、字体排版和间距配置
 * 支持表格渲染（需要 mikepenz markdown renderer 0.30.0+）
 *
 * @param markdown Markdown文本内容
 * @param isStreaming 是否正在流式输出
 * @param modifier Compose修饰符
 */
@Composable
fun BeautifulMarkdown(
    markdown: String,
    isStreaming: Boolean = false,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current

    // 自定义 Markdown 颜色配置
    val markdownColors = markdownColor(
        text = colors.TextPrimary,
        codeText = colors.PrimaryLight,
        codeBackground = colors.CodeBackground,
        inlineCodeText = colors.PrimaryLight,
        inlineCodeBackground = colors.SurfaceVariant,
        dividerColor = colors.Border,
        linkText = colors.PrimaryLight,
        tableText = colors.TextPrimary,
        tableBackground = colors.Surface,
        tableHeaderBackground = colors.SurfaceVariant,
        tableHeaderText = colors.TextPrimary,
        tableBorder = colors.Border
    )

    // 自定义 Markdown 排版配置
    val markdownTypography = markdownTypography(
        h1 = TextStyle(
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 28.sp,
            color = colors.TextPrimary
        ),
        h2 = TextStyle(
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 26.sp,
            color = colors.TextPrimary
        ),
        h3 = TextStyle(
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 24.sp,
            color = colors.TextPrimary
        ),
        h4 = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 22.sp,
            color = colors.TextPrimary
        ),
        h5 = TextStyle(
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 20.sp,
            color = colors.TextPrimary
        ),
        h6 = TextStyle(
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 18.sp,
            color = colors.TextPrimary
        ),
        text = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        code = TextStyle(
            fontSize = 13.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 19.sp,
            color = colors.PrimaryLight
        ),
        inlineCode = TextStyle(
            fontSize = 13.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 18.sp,
            color = colors.PrimaryLight
        ),
        quote = TextStyle(
            fontSize = 14.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 20.sp,
            color = colors.TextSecondary
        ),
        paragraph = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        link = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.PrimaryLight
        ),
        list = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        ordered = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        bullet = TextStyle(
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 23.sp,
            color = colors.TextPrimary
        ),
        table = TextStyle(
            fontSize = 14.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 20.sp,
            color = colors.TextPrimary
        ),
        tableHeader = TextStyle(
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 20.sp,
            color = colors.TextPrimary
        )
    )

    // 自定义组件配置，优化表格渲染
    val components = markdownComponents(
        table = { tableData ->
            CustomMarkdownTable(
                content = tableData.content,
                node = tableData.node,
                headerTextStyle = markdownTypography.tableHeader,
                bodyTextStyle = markdownTypography.table,
                headerBackgroundColor = colors.SurfaceVariant,
                borderColor = colors.Border,
                cellPadding = 12.dp
            )
        }
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
    ) {
        Markdown(
            content = markdown,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            colors = markdownColors,
            typography = markdownTypography,
            components = components
        )
    }
}

/**
 * 自定义 Markdown 表格组件
 * 优化表格的视觉效果，支持自适应列宽和更好的样式
 *
 * @param content Markdown 内容
 * @param node AST 节点
 * @param headerTextStyle 表头文字样式
 * @param bodyTextStyle 表格内容文字样式
 * @param headerBackgroundColor 表头背景色
 * @param borderColor 边框颜色
 * @param cellPadding 单元格内边距
 */
@Composable
private fun CustomMarkdownTable(
    content: String,
    node: ASTNode,
    headerTextStyle: TextStyle,
    bodyTextStyle: TextStyle,
    headerBackgroundColor: Color,
    borderColor: Color,
    cellPadding: androidx.compose.ui.unit.Dp
) {
    val tableNode = node.findChildOfType(MarkdownElementTypes.TABLE)
        ?: node.findChildOfType(MarkdownElementTypes.GFM_TABLE)

    if (tableNode == null) {
        // 回退到默认文本渲染
        MarkdownText(
            content = content,
            node = node,
            style = bodyTextStyle
        )
        return
    }

    // 解析表格结构
    val headerRow = tableNode.findChildOfType(MarkdownElementTypes.TABLE_HEADER)
    val bodyRows = tableNode.children.filter { it.type == MarkdownElementTypes.TABLE_ROW }

    if (headerRow == null) return

    val headerCells = headerRow.children.filter { it.type == MarkdownElementTypes.TABLE_CELL }
    val dataRows = bodyRows.drop(1) // 跳过表头行（如果它在 body 中）

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surface)
    ) {
        // 表头
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(headerBackgroundColor)
                .height(IntrinsicSize.Min)
        ) {
            headerCells.forEachIndexed { index, cell ->
                val isLastCell = index == headerCells.size - 1
                TableCell(
                    content = content,
                    cell = cell,
                    textStyle = headerTextStyle,
                    borderColor = borderColor,
                    isLastCell = isLastCell,
                    cellPadding = cellPadding,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // 分隔线
        HorizontalDivider(color = borderColor, thickness = 1.dp)

        // 数据行
        dataRows.forEachIndexed { rowIndex, row ->
            val cells = row.children.filter { it.type == MarkdownElementTypes.TABLE_CELL }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min)
            ) {
                cells.forEachIndexed { cellIndex, cell ->
                    val isLastCell = cellIndex == cells.size - 1
                    TableCell(
                        content = content,
                        cell = cell,
                        textStyle = bodyTextStyle,
                        borderColor = borderColor,
                        isLastCell = isLastCell,
                        cellPadding = cellPadding,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // 行间分隔线（除了最后一行）
            if (rowIndex < dataRows.size - 1) {
                HorizontalDivider(color = borderColor.copy(alpha = 0.5f), thickness = 0.5.dp)
            }
        }
    }
}

/**
 * 表格单元格组件
 *
 * @param content Markdown 内容
 * @param cell AST 单元格节点
 * @param textStyle 文字样式
 * @param borderColor 边框颜色
 * @param isLastCell 是否为最后一列
 * @param cellPadding 单元格内边距
 * @param modifier 修饰符
 */
@Composable
private fun RowScope.TableCell(
    content: String,
    cell: ASTNode,
    textStyle: TextStyle,
    borderColor: Color,
    isLastCell: Boolean,
    cellPadding: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    val cellText = remember(content, cell) {
        cell.getTextInNode(content).toString().trim()
    }

    Box(
        modifier = modifier
            .fillMaxHeight()
            .then(
                if (!isLastCell) {
                    Modifier.border(end = 0.5.dp, color = borderColor.copy(alpha = 0.5f))
                } else {
                    Modifier
                }
            )
            .padding(cellPadding)
    ) {
        Text(
            text = cellText,
            style = textStyle,
            textAlign = TextAlign.Start,
            modifier = Modifier.fillMaxWidth()
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
