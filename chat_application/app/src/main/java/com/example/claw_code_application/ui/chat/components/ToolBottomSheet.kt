package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 工具项数据类
 */
data class ToolItem(
    val icon: String,
    val label: String,
    val onClick: () -> Unit
)

/**
 * 底部抽屉工具网格 - Manus风格
 * 复刻Manus原型中点击"+"弹出的工具选择面板
 * 包含4列网格布局的工具项，顶部有拖拽手柄
 *
 * @param onDismiss 关闭抽屉回调
 * @param onCameraClick 摄像头点击回调
 * @param onImageClick 图片点击回调
 * @param onFileClick 添加文件点击回调
 * @param onConnectPcClick 连接电脑点击回调
 * @param onAddSkillClick 添加技能点击回调
 * @param onCreateWebsiteClick 创建网站点击回调
 * @param onDevelopAppClick 开发应用点击回调
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolBottomSheet(
    onDismiss: () -> Unit,
    onCameraClick: () -> Unit = {},
    onImageClick: () -> Unit = {},
    onFileClick: () -> Unit = {},
    onConnectPcClick: () -> Unit = {},
    onAddSkillClick: () -> Unit = {},
    onCreateWebsiteClick: () -> Unit = {},
    onDevelopAppClick: () -> Unit = {}
) {
    val tools = listOf(
        ToolItem(icon = "📷", label = "摄像头", onClick = onCameraClick),
        ToolItem(icon = "🖼️", label = "图片", onClick = onImageClick),
        ToolItem(icon = "📎", label = "添加文件", onClick = onFileClick),
        ToolItem(icon = "💻", label = "连接电脑", onClick = onConnectPcClick),
        ToolItem(icon = "🧩", label = "添加技能", onClick = onAddSkillClick),
        ToolItem(icon = "🌐", label = "创建网站", onClick = onCreateWebsiteClick),
        ToolItem(icon = "📱", label = "开发应用", onClick = onDevelopAppClick)
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppColor.SurfaceDark)
            .padding(horizontal = 16.dp, vertical = 20.dp)
    ) {
        SheetDragHandle()

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "添加内容或工具",
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = AppColor.TextPrimary
        )

        Spacer(modifier = Modifier.height(16.dp))

        ToolGrid(
            tools = tools,
            columns = 4
        )
    }
}

/**
 * 拖拽手柄
 * 40dp宽、4dp高灰色条，居中显示
 */
@Composable
private fun SheetDragHandle() {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier
                .width(40.dp)
                .height(4.dp),
            shape = RoundedCornerShape(2.dp),
            color = Color(0xFFDDDDDD)
        ) {}
    }
}

/**
 * 工具网格
 * 4列网格布局，每个工具项包含48dp圆角方形图标+文字标签
 */
@Composable
private fun ToolGrid(
    tools: List<ToolItem>,
    columns: Int
) {
    val rows = (tools.size + columns - 1) / columns

    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        for (rowIndex in 0 until rows) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                for (colIndex in 0 until columns) {
                    val toolIndex = rowIndex * columns + colIndex
                    if (toolIndex < tools.size) {
                        ToolGridItem(
                            tool = tools[toolIndex],
                            modifier = Modifier.weight(1f)
                        )
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/**
 * 工具网格项
 * 48dp圆角方形图标(12dp圆角) + 文字标签
 */
@Composable
private fun ToolGridItem(
    tool: ToolItem,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clickable(onClick = tool.onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Surface(
            modifier = Modifier.size(48.dp),
            shape = RoundedCornerShape(12.dp),
            color = Color(0xFFF5F5F5)
        ) {
            Box(
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = tool.icon,
                    fontSize = 20.sp
                )
            }
        }

        Text(
            text = tool.label,
            fontSize = 12.sp,
            color = AppColor.TextPrimary
        )
    }
}
