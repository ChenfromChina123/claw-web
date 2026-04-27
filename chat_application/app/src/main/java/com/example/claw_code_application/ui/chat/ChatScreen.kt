package com.example.claw_code_application.ui.chat

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.chat.components.*
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.ChatViewModel

/**
 * 聊天详情界面
 * 基于原型Manus风格设计
 * 集成底部抽屉、语音输入、更多选项菜单
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    viewModel: ChatViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    var showBottomSheet by remember { mutableStateOf(false) }
    var showMoreMenu by remember { mutableStateOf(false) }

    val displayMessages = viewModel.displayMessages

    val canAutoScroll by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex <= 1
        }
    }

    LaunchedEffect(displayMessages.size) {
        if (displayMessages.isNotEmpty() && canAutoScroll) {
            listState.animateScrollToItem(0)
        }
    }

    val onSend: (String) -> Unit = remember(viewModel) {
        { content: String -> viewModel.sendMessage(content) }
    }

    Scaffold(
        topBar = {
            ChatTopBar(
                onBack = onBack,
                showMoreMenu = showMoreMenu,
                onMoreMenuChange = { showMoreMenu = it }
            )
        },
        bottomBar = {
            InputBar(
                onSend = onSend,
                enabled = uiState !is ChatViewModel.UiState.Loading,
                onAddClick = { showBottomSheet = true }
            )
        },
        containerColor = AppColor.BackgroundDark
    ) { paddingValues ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (displayMessages.isEmpty() && uiState !is ChatViewModel.UiState.Loading) {
                ChatEmptyState()
            } else {
                ChatMessageList(
                    displayMessages = displayMessages,
                    viewModel = viewModel,
                    uiState = uiState,
                    listState = listState
                )
            }
        }
    }

    if (showBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showBottomSheet = false },
            containerColor = AppColor.SurfaceDark,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
        ) {
            ToolBottomSheet(
                onDismiss = { showBottomSheet = false }
            )
        }
    }
}

/**
 * 聊天空状态
 */
@Composable
private fun ChatEmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "开始新对话",
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = AppColor.TextPrimary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "输入消息，让 Agent 为您工作",
                fontSize = 14.sp,
                color = AppColor.TextSecondary
            )
        }
    }
}

/**
 * 聊天顶部导航栏
 */
@Composable
private fun ChatTopBar(
    onBack: () -> Unit,
    showMoreMenu: Boolean,
    onMoreMenuChange: (Boolean) -> Unit
) {
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "收藏家",
                    color = AppColor.TextPrimary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Surface(
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
                    color = AppColor.SurfaceLight
                ) {
                    Text(
                        text = "1.6 Lite",
                        color = AppColor.TextSecondary,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "返回",
                    tint = AppColor.TextPrimary
                )
            }
        },
        actions = {
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = "用户",
                tint = AppColor.TextPrimary,
                modifier = Modifier.padding(end = 8.dp)
            )
            Icon(
                imageVector = Icons.Default.Link,
                contentDescription = "链接",
                tint = AppColor.TextPrimary,
                modifier = Modifier.padding(end = 8.dp)
            )
            Box {
                IconButton(onClick = { onMoreMenuChange(true) }) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "更多",
                        tint = AppColor.TextPrimary
                    )
                }
                DropdownMenu(
                    expanded = showMoreMenu,
                    onDismissRequest = { onMoreMenuChange(false) }
                ) {
                    DropdownMenuItem(
                        text = { Text("重命名会话") },
                        onClick = { onMoreMenuChange(false) }
                    )
                    DropdownMenuItem(
                        text = { Text("分享对话") },
                        leadingIcon = { Icon(Icons.Default.Share, contentDescription = null) },
                        onClick = { onMoreMenuChange(false) }
                    )
                    DropdownMenuItem(
                        text = { Text("清空对话") },
                        onClick = { onMoreMenuChange(false) }
                    )
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text("删除会话", color = AppColor.Error) },
                        leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = AppColor.Error) },
                        onClick = { onMoreMenuChange(false) }
                    )
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = AppColor.SurfaceDark
        )
    )
}

/**
 * 聊天消息列表
 * 使用预计算的displayMessages避免重组时重复过滤
 * 添加contentType提升LazyColumn复用效率
 */
@Composable
private fun ChatMessageList(
    displayMessages: List<com.example.claw_code_application.data.api.models.Message>,
    viewModel: ChatViewModel,
    uiState: ChatViewModel.UiState,
    listState: androidx.compose.foundation.lazy.LazyListState
) {
    LazyColumn(
        state = listState,
        reverseLayout = true,
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(
            items = displayMessages,
            key = { it.id },
            contentType = { message ->
                if (message.role == "user") "user_message" else "assistant_message"
            }
        ) { message ->
            EnhancedMessageBubble(
                message = message,
                toolCalls = viewModel.getToolCallsForMessage(message.id)
            )
        }

        val activeToolCalls = viewModel.toolCalls.filter {
            it.status == "executing" || it.status == "pending"
        }
        if (activeToolCalls.isNotEmpty()) {
            item(key = "active_agent_task") {
                AgentTaskCard(
                    taskTitle = "正在执行任务",
                    steps = activeToolCalls.mapIndexed { index, toolCall ->
                        AgentStep(
                            title = getToolStepTitle(toolCall),
                            status = when (toolCall.status) {
                                "executing" -> AgentStepStatus.IN_PROGRESS
                                "completed" -> AgentStepStatus.COMPLETED
                                else -> AgentStepStatus.PENDING
                            }
                        )
                    },
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }
        }

        if (uiState is ChatViewModel.UiState.Loading) {
            item(key = "loading_indicator") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator(color = AppColor.Primary)

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Agent 思考中...",
                        color = AppColor.TextSecondary,
                        fontSize = 14.sp
                    )
                }
            }
        }

        if (uiState is ChatViewModel.UiState.Error) {
            item(key = "error_message") {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = AppColor.Error.copy(alpha = 0.1f)
                    ),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = (uiState as ChatViewModel.UiState.Error).message,
                        color = AppColor.Error,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }
    }
}

/**
 * 根据工具调用生成步骤标题
 */
private fun getToolStepTitle(toolCall: ToolCall): String {
    return when {
        toolCall.toolName.contains("shell", ignoreCase = true) -> "执行命令: ${toolCall.toolName}"
        toolCall.toolName.contains("file", ignoreCase = true) -> "操作文件: ${toolCall.toolName}"
        toolCall.toolName.contains("search", ignoreCase = true) -> "搜索信息: ${toolCall.toolName}"
        toolCall.toolName.contains("browser", ignoreCase = true) -> "浏览网页: ${toolCall.toolName}"
        toolCall.toolName.contains("write", ignoreCase = true) -> "写入文件: ${toolCall.toolName}"
        else -> "执行: ${toolCall.toolName}"
    }
}
