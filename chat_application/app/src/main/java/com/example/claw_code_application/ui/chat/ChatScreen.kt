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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.data.api.models.BackgroundTask
import com.example.claw_code_application.ui.chat.components.*
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.ui.theme.AppColors
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

    /**
     * 阈值吸附逻辑：判断用户是否在底部附近
     * reverseLayout 中 item 0 = 最新消息在底部
     * firstVisibleItemIndex <= 1 表示最新消息可见
     */
    val isNearBottom by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex <= 1
        }
    }

    // 新消息 ID 变化时：直接跳到底部（无动画，避免抖动）
    // 只监听消息ID变化，不监听内容长度变化
    // reverseLayout 下内容增长会自动向上推，不需要手动 scrollToItem
    LaunchedEffect(displayMessages.firstOrNull()?.id) {
        if (displayMessages.isNotEmpty() && isNearBottom) {
            listState.scrollToItem(0)
        }
    }

    // 会话切换时直接定位到底部
    val currentSessionId = viewModel.currentSessionId
    LaunchedEffect(currentSessionId) {
        if (displayMessages.isNotEmpty()) {
            listState.scrollToItem(0)
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
     * 使用 Column + weight(1f) 布局
     * - 消息列表占据剩余空间，自动伸缩
     * - 底部输入区域使用 imePadding() 随键盘自动上移
     * - 避免使用 onSizeChanged 手动计算 padding，消除布局位移
     */
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.Background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        // 顶部导航栏
        ChatTopBar(
            onBack = onBack
        )

        // 消息列表区域 - weight(1f) 占据剩余空间
        Box(
            modifier = Modifier.weight(1f)
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
                .background(colors.Background)
                .imePadding()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 任务状态区域（输入框上方）
            TaskStatusBar(
                viewModel = viewModel
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
    val tasks = viewModel.tasks
    val activeTasks = remember(tasks) {
        tasks.filter { it.status == "running" || it.status == "failed" }
    }

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

        if (activeTasks.isNotEmpty()) {
            item(key = "active_tasks_detail") {
                TaskDetailSection(
                    tasks = activeTasks,
                    viewModel = viewModel
                )
            }
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
 * 任务详情区域 - 在聊天上下文中展示任务操作流程
 *
 * 展示活跃任务的完整信息：状态图标 + 任务名 + 关联的工具调用列表
 * 使用 TaskContainerCard 提供可展开/收起的详细视图
 */
@Composable
private fun TaskDetailSection(
    tasks: List<BackgroundTask>,
    viewModel: ChatViewModel
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        tasks.forEach { task ->
            val isCollapsed = viewModel.collapsedTasks[task.taskId] ?: (task.status != "running")
            TaskContainerCard(
                task = task,
                isCollapsed = isCollapsed,
                onCollapsedChange = { viewModel._collapsedTasks[task.taskId] = it },
                content = {
                    val taskToolCalls = viewModel.getToolCallsForTask(task.taskId)
                    if (taskToolCalls.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            taskToolCalls.forEach { toolCall ->
                                CompactToolCallCard(
                                    toolCall = toolCall,
                                    expanded = false,
                                    onExpandedChange = {}
                                )
                            }
                        }
                    }
                }
            )
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
 * 轻量任务状态条 - 显示在输入框上方
 *
 * 仅展示任务状态摘要：状态点 + 任务名 + 状态标签 + 进度
 * 详细操作流程在聊天上下文中通过 TaskContainerCard 展示
 */
@Composable
private fun TaskStatusBar(
    viewModel: ChatViewModel
) {
    val tasks = viewModel.tasks
    val colors = AppColor.current

    val activeTasks = remember(tasks) {
        tasks.filter { it.status != "completed" && it.status != "cancelled" }
    }

    if (activeTasks.isEmpty()) return

    AnimatedVisibility(
        visible = activeTasks.isNotEmpty(),
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
                .background(colors.SurfaceVariant)
                .padding(horizontal = 16.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            activeTasks.forEach { task ->
                LightweightTaskRow(task = task, colors = colors)
            }
        }
    }
}

/**
 * 轻量任务行 - 状态点 + 任务名 + 状态标签 + 进度
 */
@Composable
private fun LightweightTaskRow(
    task: BackgroundTask,
    colors: AppColors
) {
    val statusConfig = getLightweightStatusConfig(task.status, colors)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (task.status == "running") {
            val infiniteTransition = rememberInfiniteTransition(label = "task_pulse")
            val alpha by infiniteTransition.animateFloat(
                initialValue = 1f,
                targetValue = 0.3f,
                animationSpec = infiniteRepeatable(
                    animation = tween(800, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "task_pulse_alpha"
            )
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(
                        color = statusConfig.dotColor.copy(alpha = alpha),
                        shape = CircleShape
                    )
            )
        } else {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(
                        color = statusConfig.dotColor,
                        shape = CircleShape
                    )
            )
        }

        Text(
            text = task.taskName,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = colors.TextPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )

        if (task.status == "running" && task.progress > 0) {
            Text(
                text = "${task.progress}%",
                fontSize = 11.sp,
                color = statusConfig.dotColor,
                fontWeight = FontWeight.Medium
            )
        }

        Text(
            text = statusConfig.label,
            fontSize = 11.sp,
            color = statusConfig.dotColor,
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * 轻量状态配置
 */
private data class LightweightStatusConfig(
    val dotColor: Color,
    val label: String
)

private fun getLightweightStatusConfig(status: String, colors: AppColors): LightweightStatusConfig {
    return when (status) {
        "created", "queued" -> LightweightStatusConfig(
            dotColor = colors.TextSecondary,
            label = "等待中"
        )
        "running" -> LightweightStatusConfig(
            dotColor = colors.PrimaryLight,
            label = "执行中"
        )
        "completed" -> LightweightStatusConfig(
            dotColor = colors.Success,
            label = "已完成"
        )
        "failed" -> LightweightStatusConfig(
            dotColor = colors.Error,
            label = "失败"
        )
        "cancelled" -> LightweightStatusConfig(
            dotColor = colors.TextSecondary,
            label = "已取消"
        )
        else -> LightweightStatusConfig(
            dotColor = colors.TextSecondary,
            label = status
        )
    }
}
