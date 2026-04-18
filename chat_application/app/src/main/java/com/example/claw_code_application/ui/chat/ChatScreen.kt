package com.example.claw_code_application.ui.chat

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.chat.components.*
import com.example.claw_code_application.viewmodel.ChatViewModel

/**
 * 聊天详情界面
 * 整合消息列表、工具调用卡片、输入框等组件
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

    // 滚动到最新消息
    LaunchedEffect(viewModel.messages.size) {
        if (viewModel.messages.isNotEmpty()) {
            listState.animateScrollToItem(0)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = "AI 助手",
                        color = com.example.claw_code_application.ui.theme.Color.TextPrimary
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = androidx.compose.material.icons.Default.ArrowBack,
                            contentDescription = "返回",
                            tint = com.example.claw_code_application.ui.theme.Color.TextPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topBarColors(
                    containerColor = com.example.claw_code_application.ui.theme.Color.SurfaceDark
                )
            )
        },
        bottomBar = {
            InputBar(
                onSend = { content ->
                    viewModel.sendMessage(content)
                },
                enabled = uiState !is ChatViewModel.UiState.Loading
            )
        }
    ) { paddingValues ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
                .nestedScroll(connection = rememberNestedScrollInteropConnection())
        ) {
            LazyColumn(
                state = listState,
                reverseLayout = true,  // 最新消息在底部
                contentPadding = PaddingValues(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                // 消息列表
                items(items = viewModel.messages.reversed(), key = { it.id }) { message ->
                    MessageBubble(message = message)

                    // 如果是AI消息且包含工具调用，显示工具调用卡片
                    if (message.role == "assistant" && message.toolCalls != null && message.toolCalls!!.isNotEmpty()) {
                        items(items = message.toolCalls!!, key = { it.id }) { toolCall ->
                            var expanded by remember { mutableStateOf(false) }
                            
                            ToolCallCard(
                                toolCall = toolCall,
                                expanded = expanded,
                                onExpandedChange = { expanded = it },
                                onRetry = {
                                    // 重试该工具调用（可选功能）
                                }
                            )
                        }
                    }
                }

                // 加载状态指示器
                if (uiState is ChatViewModel.UiState.Loading) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            CircularProgressIndicator(color = com.example.claw_code_application.ui.theme.Color.Primary)
                            
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            Text(
                                text = "🤖 Agent 思考中...",
                                color = com.example.claw_code_application.ui.theme.Color.TextSecondary,
                                fontSize = 14.sp
                            )

                            Spacer(modifier = Modifier.height(24.dp))

                            // 显示Agent状态面板（如果有执行状态）
                            if ((uiState as ChatViewModel.UiState.Loading).let { false }) {
                                AgentStatusPanel(
                                    executionStatus = null,
                                    toolCalls = viewModel.toolCalls,
                                    isRunning = true,
                                    onAbort = { viewModel.abortExecution() }
                                )
                            }
                        }
                    }
                }

                // 错误状态提示
                if (uiState is ChatViewModel.UiState.Error) {
                    item {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = com.example.claw_code_application.ui.theme.Color.Error.copy(alpha = 0.1f)
                            ),
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = (uiState as ChatViewModel.UiState.Error).message,
                                color = com.example.claw_code_application.ui.theme.Color.Error,
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
