package com.example.claw_code_application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.claw_code_application.ui.auth.LoginScreen
import com.example.claw_code_application.ui.auth.RegisterScreen
import com.example.claw_code_application.ui.chat.ChatScreen
import com.example.claw_code_application.ui.chat.SessionListScreen
import com.example.claw_code_application.ui.theme.ClawCodeApplicationTheme
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.AuthViewModel
import com.example.claw_code_application.viewmodel.ChatViewModel
import com.example.claw_code_application.viewmodel.SessionViewModel
import kotlinx.coroutines.launch

/**
 * 主入口Activity
 * 负责导航管理和全局主题设置
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            ClawCodeApplicationTheme {
                // 导航控制器
                val navController = rememberNavController()

                NavHost(
                    navController = navController,
                    startDestination = "auth_check"
                ) {
                    // ==================== 认证检查路由 ====================
                    composable("auth_check") {
                        AuthCheckScreen(
                            onAuthenticated = {
                                navController.navigate("chat") {
                                    popUpTo("auth_check") { inclusive = true }
                                }
                            },
                            onNotAuthenticated = {
                                navController.navigate("login") {
                                    popUpTo("auth_check") { inclusive = true }
                                }
                            }
                        )
                    }

                    // ==================== 登录页面路由 ====================
                    composable("login") {
                        LoginScreen(
                            viewModel = AuthViewModel(ClawCodeApplication.authRepository),
                            onLoginSuccess = {
                                navController.navigate("chat") {
                                    popUpTo("login") { inclusive = true }
                                }
                            },
                            onNavigateToRegister = {
                                navController.navigate("register")
                            }
                        )
                    }

                    // ==================== 注册页面路由 ====================
                    composable("register") {
                        RegisterScreen(
                            viewModel = AuthViewModel(ClawCodeApplication.authRepository),
                            onRegisterSuccess = {
                                navController.navigate("chat") {
                                    popUpTo("register") { inclusive = true }
                                }
                            },
                            onNavigateToLogin = {
                                navController.popBackStack()
                            }
                        )
                    }

                    // ==================== 聊天主界面路由 ====================
                    composable("chat") {
                        ChatMainScreen(
                            onLogout = {
                                navController.navigate("login") {
                                    popUpTo(0) { inclusive = true }
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

/**
 * 认证检查屏幕
 * 检查本地是否有有效Token，决定跳转方向
 */
@Composable
private fun AuthCheckScreen(
    onAuthenticated: () -> Unit,
    onNotAuthenticated: () -> Unit
) {
    LaunchedEffect(Unit) {
        launch {
            // 检查是否有存储的Token
            ClawCodeApplication.tokenManager.getToken().collect { token ->
                if (!token.isNullOrEmpty()) {
                    onAuthenticated()
                } else {
                    onNotAuthenticated()
                }
            }
        }
    }

    // 显示加载指示器
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = AppColor.Primary)
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = "正在检查登录状态...",
                color = AppColor.TextSecondary,
                fontSize = 14.sp
            )
        }
    }
}

/**
 * 聊天主界面（包含会话列表和聊天详情）
 * 集成SessionViewModel实现完整的会话管理功能
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatMainScreen(
    onLogout: () -> Unit
) {
    // 创建会话ViewModel
    val sessionViewModel = SessionViewModel(
        chatRepository = ClawCodeApplication.chatRepository,
        tokenManager = ClawCodeApplication.tokenManager
    )
    
    var selectedSessionId by remember { mutableStateOf<String?>(null) }
    var showSessionList by remember { mutableStateOf(true) }

    // 监听会话列表UI状态
    val sessionUiState by sessionViewModel.uiState.collectAsStateWithLifecycle()

    // 初始加载会话列表
    LaunchedEffect(Unit) {
        sessionViewModel.loadSessions()
    }

    Row(modifier = Modifier.fillMaxSize()) {
        // 左侧会话列表
        AnimatedVisibility(visible = showSessionList) {
            Surface(
                modifier = Modifier.width(320.dp),
                color = AppColor.BackgroundDark
            ) {
                when (val state = sessionUiState) {
                    is SessionViewModel.UiState.Loading -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = AppColor.Primary)
                        }
                    }
                    
                    is SessionViewModel.UiState.Success -> {
                        SessionListScreen(
                            sessions = state.sessions,
                            currentSessionId = selectedSessionId,
                            onSelect = { sessionId ->
                                sessionViewModel.selectSession(sessionId)
                                selectedSessionId = sessionId
                                showSessionList = false
                            },
                            onCreateNew = {
                                // 创建新会话
                                kotlinx.coroutines.MainScope().launch {
                                    val newSessionId = sessionViewModel.createNewSession()
                                    if (newSessionId != null) {
                                        selectedSessionId = newSessionId
                                        showSessionList = false
                                    }
                                }
                            },
                            onDelete = { sessionId ->
                                sessionViewModel.deleteSession(sessionId)
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    
                    is SessionViewModel.UiState.Error -> {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    text = "加载失败",
                                    color = AppColor.Error,
                                    fontSize = 16.sp
                                )
                                
                                Spacer(modifier = Modifier.height(8.dp))
                                
                                Text(
                                    text = state.message,
                                    color = AppColor.TextSecondary,
                                    fontSize = 14.sp
                                )
                                
                                Spacer(modifier = Modifier.height(16.dp))
                                
                                Button(onClick = { sessionViewModel.refresh() }) {
                                    Text("重试")
                                }
                            }
                        }
                    }
                    
                    else -> {}
                }
            }
        }

        // 右侧聊天详情
        if (selectedSessionId != null || !showSessionList) {
            ChatScreen(
                viewModel = ChatViewModel(
                    chatRepository = ClawCodeApplication.chatRepository,
                    tokenManager = ClawCodeApplication.tokenManager
                ).also { viewModel ->
                    // 如果有选中的会话，加载其历史消息
                    selectedSessionId?.let { sessionId ->
                        viewModel.loadSession(sessionId)
                    }
                },
                onBack = {
                    showSessionList = true
                    // 不清空selectedSessionId，保持选中状态
                },
                modifier = Modifier.weight(1f)
            )
        } else {
            // 未选择会话时显示空状态
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(AppColor.SurfaceDark),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.ChatBubbleOutline,
                        contentDescription = null,
                        tint = AppColor.TextSecondary.copy(alpha = 0.5f),
                        modifier = Modifier.size(80.dp)
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Text(
                        text = "选择或创建一个会话开始聊天",
                        color = AppColor.TextSecondary,
                        fontSize = 16.sp
                    )
                }
            }
        }
    }
}
