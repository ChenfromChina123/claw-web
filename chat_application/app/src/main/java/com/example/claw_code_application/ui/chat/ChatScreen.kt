package com.example.claw_code_application.ui.chat

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.chat.components.*
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.ChatViewModel
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding

/**
 * 聊天详情界面 - Manus 1.6 Lite 风格
 * 
 * 设计特点：
 * - 极简、克制、专业
 * - 消息气泡逐行淡入显示
 * - 加载动效简洁流畅
 * - 支持主题切换
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    viewModel: ChatViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    var showBottomSheet by remember { mutableStateOf(false) }
    var showMoreMenu by remember { mutableStateOf(false) }
    var showFilePicker by remember { mutableStateOf(false) }

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

    /**
     * 使用Box布局实现悬浮输入框
     * - 输入框悬浮在底部，使用imePadding()随键盘自动上移
     * - 避免使用Scaffold的bottomBar，防止键盘弹出时的黑屏闪烁
     */
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.Background)
    ) {
        // 顶部导航栏 - 添加状态栏内边距适配动态岛/刘海屏
        ChatTopBar(
            onBack = onBack,
            showMoreMenu = showMoreMenu,
            onMoreMenuChange = { showMoreMenu = it },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .windowInsetsPadding(WindowInsets.statusBars)
        )

        // 消息列表区域 - 使用 WindowInsets 动态计算顶部空间
        Box(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(top = 64.dp, bottom = 76.dp)
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

        // 悬浮输入框 - 固定在底部，随键盘自动上移
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding()
        ) {
            InputBar(
                onSend = onSend,
                enabled = uiState !is ChatViewModel.UiState.Loading,
                onAddClick = { showFilePicker = true }
            )
        }
    }

    if (showBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showBottomSheet = false },
            containerColor = colors.Surface,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
        ) {
            ToolBottomSheet(
                onDismiss = { showBottomSheet = false }
            )
        }
    }

    // 文件选择器对话框
    if (showFilePicker) {
        val currentSessionId = viewModel.currentSessionId
        if (currentSessionId != null) {
            FilePickerDialog(
                onDismiss = { showFilePicker = false },
                onFilesSelected = { files ->
                    showFilePicker = false
                    // 上传文件到工作区
                    viewModel.uploadFilesToWorkdir(
                        files = files,
                        directory = "uploads",
                        onComplete = { successCount, failedCount, failedNames ->
                            // 上传完成后的处理（可以显示 Toast 或 Snackbar）
                            android.util.Log.i(
                                "ChatScreen",
                                "文件上传完成: 成功=$successCount, 失败=$failedCount"
                            )
                        }
                    )
                },
                sessionId = currentSessionId
            )
        } else {
            // 如果没有会话，先创建一个
            showFilePicker = false
        }
    }
}

/**
 * 聊天空状态 - Manus风格
 */
@Composable
private fun ChatEmptyState() {
    val colors = AppColor.current
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "开始新对话",
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.TextPrimary
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "输入消息，让 Agent 为您工作",
                fontSize = 14.sp,
                color = colors.TextSecondary
            )
        }
    }
}

/**
 * 聊天顶部导航栏 - Manus 1.6 Lite 风格
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatTopBar(
    onBack: () -> Unit,
    showMoreMenu: Boolean,
    onMoreMenuChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    TopAppBar(
        modifier = modifier,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "收藏家",
                    color = colors.TextPrimary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 17.sp
                )
                Spacer(modifier = Modifier.width(10.dp))
                Surface(
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
                    color = colors.SurfaceVariant
                ) {
                    Text(
                        text = "1.6 Lite",
                        color = colors.TextSecondary,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "返回",
                    tint = colors.TextPrimary
                )
            }
        },
        actions = {
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = "用户",
                tint = colors.TextSecondary,
                modifier = Modifier.padding(end = 8.dp)
            )
            Icon(
                imageVector = Icons.Default.Link,
                contentDescription = "链接",
                tint = colors.TextSecondary,
                modifier = Modifier.padding(end = 8.dp)
            )
            Box {
                IconButton(onClick = { onMoreMenuChange(true) }) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "更多",
                        tint = colors.TextSecondary
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
                        text = { Text("删除会话", color = colors.Error) },
                        leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = colors.Error) },
                        onClick = { onMoreMenuChange(false) }
                    )
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = colors.Surface
        )
    )
}

/**
 * 聊天消息列表 - Manus 1.6 Lite 风格
 *
 * 特点：
 * - 消息间距统一
 * - 加载状态简洁
 * - 错误提示清晰
 *
 * 性能优化：
 * - 使用 remember 缓存工具调用查询结果
 * - 添加 contentType 优化列表项复用
 * - 使用 key 避免不必要的重组
 */
@Composable
private fun ChatMessageList(
    displayMessages: List<com.example.claw_code_application.data.api.models.Message>,
    viewModel: ChatViewModel,
    uiState: ChatViewModel.UiState,
    listState: androidx.compose.foundation.lazy.LazyListState
) {
    val colors = AppColor.current

    // 缓存每条消息的工具调用，避免每次滚动都重新查询
    val messageToolCalls = remember(displayMessages, viewModel.toolCalls) {
        displayMessages.associate { message ->
            message.id to viewModel.getToolCallsForMessage(message.id)
        }
    }

    LazyColumn(
        state = listState,
        reverseLayout = true,
        contentPadding = PaddingValues(vertical = 16.dp),
        // 关键性能优化：限制可见项数量，超出部分不渲染
        modifier = Modifier.fillMaxSize(),
        // 启用预加载优化
        beyondBoundsItemCount = 3
    ) {
        items(
            items = displayMessages,
            key = { message -> message.id },
            contentType = { message ->
                when (message.role) {
                    "user" -> "user_message"
                    "assistant" -> "assistant_message"
                    else -> "system_message"
                }
            }
        ) { message ->
            // 使用缓存的工具调用数据
            val toolCalls = messageToolCalls[message.id] ?: emptyList()
            // 关键优化：使用 remember 缓存消息气泡，避免不必要的重组
            key(message.id) {
                EnhancedMessageBubble(
                    message = message,
                    toolCalls = toolCalls,
                    modifier = Modifier
                        .padding(vertical = 8.dp)
                        // 关键优化：为每个列表项设置稳定的布局约束
                        .animateItem(fadeInSpec = null, fadeOutSpec = null)
                )
            }
        }

        // 使用 key 来避免不必要的重组
        item(key = "active_agent_task_${viewModel.toolCalls.hashCode()}") {
            val activeToolCalls = viewModel.toolCalls.filter {
                it.status == "executing" || it.status == "pending"
            }
            if (activeToolCalls.isNotEmpty()) {
                val steps = remember(activeToolCalls) {
                    activeToolCalls.mapIndexed { index, toolCall ->
                        AgentStep(
                            title = getToolStepTitle(toolCall),
                            status = when (toolCall.status) {
                                "executing" -> AgentStepStatus.IN_PROGRESS
                                "completed" -> AgentStepStatus.COMPLETED
                                else -> AgentStepStatus.PENDING
                            }
                        )
                    }
                }
                AgentTaskCard(
                    taskTitle = "正在执行任务",
                    steps = steps,
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
                    val infiniteTransition = rememberInfiniteTransition(label = "loading")
                    val alpha by infiniteTransition.animateFloat(
                        initialValue = 0.3f,
                        targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(600, easing = LinearEasing),
                            repeatMode = RepeatMode.Reverse
                        ),
                        label = "loading_alpha"
                    )
                    
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        repeat(3) { index ->
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .background(
                                        color = colors.PrimaryLight.copy(alpha = alpha),
                                        shape = CircleShape
                                    )
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Agent 思考中...",
                        color = colors.TextSecondary,
                        fontSize = 13.sp
                    )
                }
            }
        }

        if (uiState is ChatViewModel.UiState.Error) {
            item(key = "error_message") {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
                    color = colors.ErrorBackground,
                    border = androidx.compose.foundation.BorderStroke(1.dp, colors.Error.copy(alpha = 0.3f))
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(text = "⚠️", fontSize = 18.sp)
                        Text(
                            text = (uiState as ChatViewModel.UiState.Error).message,
                            color = colors.ErrorText,
                            fontSize = 13.sp
                        )
                    }
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
