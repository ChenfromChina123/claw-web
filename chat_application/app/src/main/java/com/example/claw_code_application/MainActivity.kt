package com.example.claw_code_application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.compose.BackHandler
import com.example.claw_code_application.ui.auth.LoginScreen
import com.example.claw_code_application.ui.auth.RegisterScreen
import com.example.claw_code_application.ui.chat.ChatScreen
import com.example.claw_code_application.ui.chat.SessionListScreen
import com.example.claw_code_application.ui.chat.components.AgentTaskMonitorPanel
import com.example.claw_code_application.ui.theme.ClawCodeApplicationTheme
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.AgentTaskMonitorViewModel
import com.example.claw_code_application.viewmodel.AuthViewModel
import com.example.claw_code_application.viewmodel.ChatViewModel
import com.example.claw_code_application.viewmodel.SessionViewModel
import kotlinx.coroutines.flow.first
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
                val navController = rememberNavController()

                NavHost(
                    navController = navController,
                    startDestination = "auth_check"
                ) {
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

                    composable("login") {
                        val authViewModel: AuthViewModel = viewModel(
                            factory = AuthViewModel.provideFactory(ClawCodeApplication.authRepository)
                        )
                        LoginScreen(
                            viewModel = authViewModel,
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

                    composable("register") {
                        val authViewModel: AuthViewModel = viewModel(
                            factory = AuthViewModel.provideFactory(ClawCodeApplication.authRepository)
                        )
                        RegisterScreen(
                            viewModel = authViewModel,
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
 */
@Composable
private fun AuthCheckScreen(
    onAuthenticated: () -> Unit,
    onNotAuthenticated: () -> Unit
) {
    LaunchedEffect(Unit) {
        val token = ClawCodeApplication.tokenManager.getToken().first()
        if (!token.isNullOrEmpty()) {
            onAuthenticated()
        } else {
            onNotAuthenticated()
        }
    }

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
 * 聊天主界面
 * 使用viewModel()确保ViewModel生命周期正确管理，避免重组时重复创建
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatMainScreen(
    onLogout: () -> Unit
) {
    val sessionViewModel: SessionViewModel = viewModel {
        SessionViewModel(
            cachedChatRepository = ClawCodeApplication.cachedChatRepository,
            tokenManager = ClawCodeApplication.tokenManager
        )
    }

    val chatViewModel: ChatViewModel = viewModel(
        factory = ChatViewModel.provideFactory(
            cachedChatRepository = ClawCodeApplication.cachedChatRepository,
            tokenManager = ClawCodeApplication.tokenManager,
            sessionLocalStore = ClawCodeApplication.sessionLocalStore
        )
    )

    var selectedSessionId by remember { mutableStateOf<String?>(null) }
    var showSessionList by remember { mutableStateOf(true) }
    var showExitDialog by remember { mutableStateOf(false) }
    var isNewSession by remember { mutableStateOf(false) }

    val sessionUiState by sessionViewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        sessionViewModel.loadSessions()
    }

    val taskMonitorViewModel: AgentTaskMonitorViewModel = viewModel {
        AgentTaskMonitorViewModel(
            tokenManager = ClawCodeApplication.tokenManager,
            webSocketManager = ClawCodeApplication.webSocketManager
        )
    }

    val scope = rememberCoroutineScope()

    /**
     * 处理系统返回键事件
     * 1. 在聊天界面：返回到会话列表
     * 2. 在会话列表：弹出退出确认对话框
     */
    BackHandler(enabled = true) {
        if (!showSessionList && selectedSessionId != null) {
            // 当前在聊天界面，返回到会话列表
            chatViewModel.clearSession()
            selectedSessionId = null
            showSessionList = true
        } else if (showSessionList) {
            // 当前在会话列表，显示退出确认对话框
            showExitDialog = true
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = showSessionList || selectedSessionId == null,
            enter = fadeIn() + slideInHorizontally { -it },
            exit = fadeOut() + slideOutHorizontally { -it }
        ) {
            Surface(
                modifier = Modifier.fillMaxSize(),
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
                        Box(modifier = Modifier.fillMaxSize()) {
                            SessionListScreen(
                                sessions = state.sessions,
                                currentSessionId = selectedSessionId,
                                onSelect = { sessionId ->
                                    sessionViewModel.selectSession(sessionId)
                                    selectedSessionId = sessionId
                                    isNewSession = false
                                    showSessionList = false
                                },
                                onCreateNew = {
                                    scope.launch {
                                        val newSessionId = sessionViewModel.createNewSession()
                                        if (newSessionId != null) {
                                            chatViewModel.initNewSession(newSessionId)
                                            selectedSessionId = newSessionId
                                            isNewSession = true
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

        AnimatedVisibility(
            visible = selectedSessionId != null && !showSessionList,
            enter = fadeIn() + slideInHorizontally { it },
            exit = fadeOut() + slideOutHorizontally { it }
        ) {
            val currentSessionId = selectedSessionId
            if (currentSessionId != null) {
                LaunchedEffect(currentSessionId) {
                    if (!isNewSession) {
                        chatViewModel.loadSession(currentSessionId)
                    }
                }

                ChatScreen(
                    viewModel = chatViewModel,
                    onBack = {
                        chatViewModel.clearSession()
                        selectedSessionId = null
                        showSessionList = true
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }

        AgentTaskMonitorPanel(
            viewModel = taskMonitorViewModel,
            modifier = Modifier.fillMaxSize()
        )
    }

    /**
     * 退出应用确认对话框
     * 在会话列表界面按返回键时显示
     */
    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            containerColor = AppColor.SurfaceDark,
            titleContentColor = AppColor.TextPrimary,
            textContentColor = AppColor.TextSecondary,
            title = { Text("确认退出") },
            text = { Text("确定要退出应用吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showExitDialog = false
                        // 调用系统的 finish() 方法退出应用
                        if (android.os.Process.myPid() > 0) {
                            android.os.Process.killProcess(android.os.Process.myPid())
                        }
                    }
                ) {
                    Text("退出", color = AppColor.Error)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showExitDialog = false }
                ) {
                    Text("取消", color = AppColor.Primary)
                }
            }
        )
    }
}
