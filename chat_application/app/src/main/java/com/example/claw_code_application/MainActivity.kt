package com.example.claw_code_application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.navigation.NavHostController
import androidx.navigation.compose.*
import com.example.claw_code_application.ui.auth.LoginScreen
import com.example.claw_code_application.ui.chat.ChatScreen
import com.example.claw_code_application.ui.chat.SessionListScreen
import com.example.claw_code_application.ui.theme.ClawCodeApplicationTheme
import com.example.claw_code_application.viewmodel.AuthViewModel
import com.example.claw_code_application.viewmodel.ChatViewModel
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
                                // TODO: 实现注册页面跳转
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
        contentAlignment = androidx.compose.ui.Alignment.Center
    ) {
        CircularProgressIndicator(
            color = com.example.claw_code_application.ui.theme.Color.Primary
        )
    }
}

/**
 * 聊天主界面（包含会话列表和聊天详情）
 */
@Composable
private fun ChatMainScreen(
    onLogout: () -> Unit
) {
    var selectedSessionId by remember { mutableStateOf<String?>(null) }
    var showSessionList by remember { mutableStateOf(true) }

    Row(modifier = Modifier.fillMaxSize()) {
        // 左侧会话列表
        AnimatedVisibility(visible = showSessionList) {
            SessionListScreen(
                sessions = emptyList(),  // TODO: 从ViewModel加载
                currentSessionId = selectedSessionId,
                onSelect = { sessionId ->
                    selectedSessionId = sessionId
                    showSessionList = false
                },
                onCreateNew = {
                    selectedSessionId = null
                    showSessionList = false
                },
                onDelete = { /* TODO */ },
                modifier = Modifier.width(300.dp)
            )
        }

        // 右侧聊天详情
        if (selectedSessionId != null || !showSessionList) {
            ChatScreen(
                viewModel = ChatViewModel(
                    chatRepository = ClawCodeApplication.chatRepository,
                    tokenManager = ClawCodeApplication.tokenManager
                ),
                onBack = {
                    showSessionList = true
                    selectedSessionId = null
                },
                modifier = Modifier.weight(1f)
            )
        }
    }
}
