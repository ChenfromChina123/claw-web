package com.example.claw_code_application.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.claw_code_application.data.api.models.ToolCall
import com.example.claw_code_application.ui.chat.components.*
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.ChatViewModel

/**
 * 聊天详情界面
 * 基于原型Manus风格设计 - 浅色主题
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "收藏家",
                            color = AppColor.TextPrimary,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
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
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "更多",
                        tint = AppColor.TextPrimary,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AppColor.SurfaceDark
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
        },
        containerColor = AppColor.BackgroundDark
    ) { paddingValues ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            LazyColumn(
                state = listState,
                reverseLayout = true,
                contentPadding = PaddingValues(vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                // 消息列表 - 使用增强版消息气泡
                items(
                    items = viewModel.messages.reversed(),
                    key = { it.id }
                ) { message ->
                    EnhancedMessageBubble(
                        message = message,
                        toolCalls = viewModel.getToolCallsForMessage(message.id)
                    )
                }

                /**
                 * 显示未关联到任何消息的活跃工具调用
                 * 这些工具调用可能正在执行中但尚未关联到助手消息
                 */
                val activeToolCalls = viewModel.toolCalls.filter { 
                    it.status == "executing" || it.status == "pending" 
                }
                if (activeToolCalls.isNotEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = "🔄 正在执行工具",
                                fontSize = 12.sp,
                                color = AppColor.TextSecondary,
                                modifier = Modifier.padding(bottom = 8.dp)
                            )
                            activeToolCalls.forEach { toolCall ->
                                var expanded by remember { mutableStateOf(false) }
                                ToolCallCard(
                                    toolCall = toolCall,
                                    expanded = expanded,
                                    onExpandedChange = { expanded = it }
                                )
                            }
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
                            CircularProgressIndicator(color = AppColor.Primary)
                            
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            Text(
                                text = "🤖 Agent 思考中...",
                                color = AppColor.TextSecondary
                            )
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
    }
}
