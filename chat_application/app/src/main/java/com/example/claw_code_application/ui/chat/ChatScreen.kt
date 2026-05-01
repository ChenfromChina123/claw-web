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
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.data.api.models.BackgroundTask
import com.example.claw_code_application.ui.chat.components.*
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.ChatViewModel
import kotlinx.coroutines.delay
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
    var showFilePicker by remember { mutableStateOf(false) }
    var showSkillPicker by remember { mutableStateOf(false) }
    val selectedSkills = remember { mutableStateListOf<SkillAttachment>() }

    // 网站预览弹窗状态
    var showWebsitePreview by remember { mutableStateOf(false) }
    var websitePreviewUrl by remember { mutableStateOf("") }
    var websitePreviewTitle by remember { mutableStateOf("网站预览") }

    /**
     * 处理预览网站按钮点击
     */
    val handlePreviewWebsite: (String) -> Unit = { url ->
        websitePreviewUrl = url
        websitePreviewTitle = "网站预览"
        showWebsitePreview = true
    }

    val displayMessages = viewModel.displayMessages

    val density = LocalDensity.current
    var bottomBarHeight by remember { mutableStateOf(76) }

    // 用户手动滑动时暂停自动滚动
    var userScrolling by remember { mutableStateOf(false) }

    // 检测用户是否正在滑动
    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress) {
            userScrolling = true
        } else {
            delay(1500L)
            userScrolling = false
        }
    }

    // 判断是否允许自动滚动：在顶部附近（reverseLayout中item0=最新消息在底部）且用户没有主动滑动
    val canAutoScroll by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex <= 1 && !userScrolling
        }
    }

    // 消息数量变化时自动滚动到底部（新消息添加时触发）
    LaunchedEffect(displayMessages.size) {
        if (displayMessages.isNotEmpty() && canAutoScroll) {
            listState.animateScrollToItem(0)
        }
    }

    // 会话切换时直接定位到底部（仅在sessionId变化时触发，避免流式更新时频繁滚动）
    val currentSessionId = viewModel.currentSessionId
    LaunchedEffect(currentSessionId) {
        if (displayMessages.isNotEmpty()) {
            listState.scrollToItem(0)
        }
    }

    // 流式内容增长时：智能滚动跟随 - 优化版
    // 优化点：
    // 1. 增加滚动触发阈值从300到800字符，减少滚动频率
    // 2. 使用scrollToItem替代animateScrollToItem，避免动画与内容更新冲突导致的抖动
    val streamingMessage = displayMessages.firstOrNull { it.isStreaming }
    var lastScrollLength by remember { mutableStateOf(0) }

    LaunchedEffect(streamingMessage?.content?.length) {
        if (streamingMessage != null && canAutoScroll) {
            val currentLength = streamingMessage.content.length
            // 增加阈值到800字符，减少滚动频率，避免抖动
            if (currentLength - lastScrollLength >= 800 || lastScrollLength == 0) {
                lastScrollLength = currentLength
                // 使用scrollToItem而非animateScrollToItem，避免动画冲突
                listState.scrollToItem(0)
            }
        }
    }

    // 检测是否需要加载更多历史消息（reverseLayout中，底部=历史消息末尾）
    val shouldLoadMore by remember {
        derivedStateOf {
            val layoutInfo = listState.layoutInfo
            val lastVisibleIndex = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = layoutInfo.totalItemsCount
            lastVisibleIndex >= totalItems - 3 && viewModel.hasMoreHistory && !viewModel.isLoadingHistory
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            viewModel.loadOlderMessages()
        }
    }

    val onSend: (String, List<SkillAttachment>) -> Unit = remember(viewModel) {
        { content: String, skills: List<SkillAttachment> ->
            val finalContent = buildMessageWithSkills(content, skills)
            viewModel.sendMessage(finalContent)
            selectedSkills.clear()
        }
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
            modifier = Modifier
                .align(Alignment.TopCenter)
                .windowInsetsPadding(WindowInsets.statusBars)
        )

        // 消息列表区域 - 使用 WindowInsets 动态计算顶部空间
        Box(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(top = 64.dp, bottom = with(density) { bottomBarHeight.toDp() })
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

        // 底部区域：任务状态 + 输入框
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .background(colors.Background)
                .onSizeChanged { size ->
                    bottomBarHeight = size.height
                }
                .imePadding()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 任务状态区域（输入框上方）
            TaskStatusBar(
                viewModel = viewModel,
                onPreviewWebsite = handlePreviewWebsite
            )

            // 新对话快捷操作（仅在消息为空时显示）
            val messages = viewModel.messages
            if (messages.isEmpty()) {
                QuickActionChips(
                    onActionClick = { prompt ->
                        onSend(prompt, emptyList())
                    }
                )
            }

            // 输入框
            InputBar(
                onSend = { content -> onSend(content, selectedSkills.toList()) },
                enabled = uiState !is ChatViewModel.UiState.Loading,
                onAddClick = { showBottomSheet = true },
                selectedSkills = selectedSkills,
                onRemoveSkill = { skill -> selectedSkills.remove(skill) }
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
                onDismiss = { showBottomSheet = false },
                onFileClick = {
                    showBottomSheet = false
                    showFilePicker = true
                },
                onImageClick = {
                    showBottomSheet = false
                },
                onAddSkillClick = {
                    showBottomSheet = false
                    showSkillPicker = true
                }
            )
        }
    }

    // 技能选择器底部弹窗
    if (showSkillPicker) {
        SkillPickerSheet(
            onDismiss = { showSkillPicker = false },
            onSkillSelected = { skill ->
                if (selectedSkills.none { it.id == skill.id }) {
                    selectedSkills.add(skill)
                }
                showSkillPicker = false
            }
        )
    }

    // 网站预览弹窗
    if (showWebsitePreview && websitePreviewUrl.isNotBlank()) {
        WebsitePreviewDialog(
            url = websitePreviewUrl,
            title = websitePreviewTitle,
            onDismiss = { showWebsitePreview = false }
        )
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
 */
@Composable
private fun ChatMessageList(
    displayMessages: List<com.example.claw_code_application.data.api.models.Message>,
    viewModel: ChatViewModel,
    uiState: ChatViewModel.UiState,
    listState: androidx.compose.foundation.lazy.LazyListState
) {
    val colors = AppColor.current
    LazyColumn(
        state = listState,
        reverseLayout = true,
        verticalArrangement = Arrangement.Top,
        contentPadding = PaddingValues(vertical = 16.dp),
        modifier = Modifier.fillMaxSize()
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
            EnhancedMessageBubble(
                message = message,
                toolCalls = viewModel.getToolCallsForMessage(message.id),
                modifier = Modifier.padding(vertical = 4.dp)
            )
        }

        // 加载历史消息指示器（reverseLayout中显示在底部=视觉上的顶部）
        if (viewModel.isLoadingHistory) {
            item(key = "loading_history") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                        color = colors.PrimaryLight
                    )
                }
            }
        } else if (viewModel.hasMoreHistory) {
            item(key = "load_more_hint") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "↑ 向上滑动加载更多",
                        color = colors.TextSecondary,
                        fontSize = 12.sp
                    )
                }
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
 * 技能附件数据类，用于在输入框上方以芯片形式展示已选技能
 */
data class SkillAttachment(
    val id: String,
    val name: String,
    val description: String
)

/**
 * 将用户消息与技能引用拼接为最终发送内容
 * 格式与 Web 端保持一致：### 使用 Skill: {name}\n{description}
 */
private fun buildMessageWithSkills(content: String, skills: List<SkillAttachment>): String {
    if (skills.isEmpty()) return content
    val skillParts = skills.joinToString("\n\n") { skill ->
        "### 使用 Skill: ${skill.name}\n${skill.description}"
    }
    return "$skillParts\n\n$content"
}

/**
 * 任务状态栏 - 显示在输入框上方
 *
 * 展示当前活跃任务的实时状态，支持展开/折叠
 * 任务完成时自动折叠，失败时保持展开
 * 
 * 优化：使用预构建的 taskId -> toolCalls 映射缓存，避免每次重组都进行全表扫描
 */
@Composable
private fun TaskStatusBar(
    viewModel: ChatViewModel,
    onPreviewWebsite: (String) -> Unit = {}
) {
    val tasks = viewModel.tasks
    val colors = AppColor.current

    if (tasks.isEmpty()) return
    
    // 当 tasks 或 toolCalls 变化时，重建缓存
    LaunchedEffect(tasks.size, viewModel.toolCalls.size) {
        viewModel.rebuildTaskToolCallCache()
    }

    val activeTasks = tasks.filter { it.status != "completed" && it.status != "cancelled" }
    val completedTasks = tasks.filter { it.status == "completed" || it.status == "cancelled" }

    AnimatedVisibility(
        visible = tasks.isNotEmpty(),
        enter = expandVertically(
            animationSpec = tween(250, easing = FastOutSlowInEasing)
        ) + fadeIn(animationSpec = tween(200)),
        exit = shrinkVertically(
            animationSpec = tween(200, easing = FastOutSlowInEasing)
        ) + fadeOut(animationSpec = tween(150))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 200.dp)
                .background(colors.SurfaceVariant)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            activeTasks.forEach { task ->
                val isCollapsed = viewModel.collapsedTasks[task.taskId] ?: false
                TaskContainerCard(
                    task = task,
                    isCollapsed = isCollapsed,
                    onCollapsedChange = { viewModel._collapsedTasks[task.taskId] = it },
                    content = {
                        // 使用缓存的工具调用列表，避免每次重组都 filter
                        val taskToolCalls = viewModel.getToolCallsForTask(task.taskId)
                        if (taskToolCalls.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                taskToolCalls.forEach { toolCall ->
                                    CompactToolCallCard(
                                        toolCall = toolCall,
                                        expanded = false,
                                        onExpandedChange = {},
                                        onPreviewWebsite = onPreviewWebsite
                                    )
                                }
                            }
                        }
                    }
                )
            }

            completedTasks.forEach { task ->
                val isCollapsed = viewModel.collapsedTasks[task.taskId] ?: true
                TaskContainerCard(
                    task = task,
                    isCollapsed = isCollapsed,
                    onCollapsedChange = { viewModel._collapsedTasks[task.taskId] = it },
                    content = {
                        // 使用缓存的工具调用列表，避免每次重组都 filter
                        val taskToolCalls = viewModel.getToolCallsForTask(task.taskId)
                        if (taskToolCalls.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                taskToolCalls.forEach { toolCall ->
                                    CompactToolCallCard(
                                        toolCall = toolCall,
                                        expanded = false,
                                        onExpandedChange = {},
                                        onPreviewWebsite = onPreviewWebsite
                                    )
                                }
                            }
                        }
                    }
                )
            }
        }
    }
}
