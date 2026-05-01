package com.example.claw_code_application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.*
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
import androidx.activity.compose.BackHandler
import com.example.claw_code_application.ui.auth.LoginScreen
import com.example.claw_code_application.ui.auth.RegisterScreen
import com.example.claw_code_application.ui.chat.ChatScreen
import com.example.claw_code_application.ui.chat.SessionListScreen
import com.example.claw_code_application.ui.chat.components.SettingsDrawer
import com.example.claw_code_application.ui.chat.components.ThemeMode
import com.example.claw_code_application.ui.components.AppSplashScreen
import com.example.claw_code_application.ui.theme.BubbleTheme
import com.example.claw_code_application.ui.theme.parseBubbleTheme
import com.example.claw_code_application.ui.theme.ClawCodeApplicationTheme
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.AuthViewModel
import com.example.claw_code_application.viewmodel.ChatViewModel
import com.example.claw_code_application.viewmodel.SessionViewModel
import com.example.claw_code_application.data.local.PushMessageStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * 主入口Activity
 * 负责导航管理和全局主题设置
 * 优化启动流程，延迟加载非关键组件
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            // 使用 remember 缓存主题偏好存储
            val themePreferencesStore = remember { ClawCodeApplication.themePreferencesStore }
            val scope = rememberCoroutineScope()
            
            // 使用 remember 缓存主题状态
            var currentTheme by remember { mutableStateOf(ThemeMode.SYSTEM) }
            var currentBubbleTheme by remember { mutableStateOf(BubbleTheme.OCEAN) }
            
            // 异步加载保存的主题设置
            LaunchedEffect(Unit) {
                val savedTheme = themePreferencesStore.getThemeModeSync()
                currentTheme = when (savedTheme) {
                    "LIGHT" -> ThemeMode.LIGHT
                    "DARK" -> ThemeMode.DARK
                    else -> ThemeMode.SYSTEM
                }
                val savedBubbleTheme = themePreferencesStore.getBubbleThemeSync()
                currentBubbleTheme = parseBubbleTheme(savedBubbleTheme)
            }
            
            ClawCodeApplicationTheme(themeMode = currentTheme, bubbleTheme = currentBubbleTheme) {
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
                            currentTheme = currentTheme,
                            onThemeChange = { newTheme ->
                                currentTheme = newTheme
                                scope.launch {
                                    val themeString = when (newTheme) {
                                        ThemeMode.LIGHT -> "LIGHT"
                                        ThemeMode.DARK -> "DARK"
                                        ThemeMode.SYSTEM -> "SYSTEM"
                                    }
                                    themePreferencesStore.saveThemeMode(themeString)
                                }
                            },
                            currentBubbleTheme = currentBubbleTheme,
                            onBubbleThemeChange = { newBubbleTheme ->
                                currentBubbleTheme = newBubbleTheme
                                scope.launch {
                                    themePreferencesStore.saveBubbleTheme(newBubbleTheme.name)
                                }
                            },
                            onLogout = {
                                scope.launch {
                                    // 清除登录状态
                                    ClawCodeApplication.authRepository.logout()
                                    // 导航到登录页面
                                    navController.navigate("login") {
                                        popUpTo(0) { inclusive = true }
                                    }
                                }
                            },
                            onNavigateToLogin = {
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
 * 检查登录状态，如果已登录但缺少用户信息则尝试获取
 * 使用精美加载动画，避免白屏闪烁
 */
@Composable
private fun AuthCheckScreen(
    onAuthenticated: () -> Unit,
    onNotAuthenticated: () -> Unit
) {
    var isChecking by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        try {
            val token = ClawCodeApplication.tokenManager.getToken().first()
            if (!token.isNullOrEmpty()) {
                val userInfo = ClawCodeApplication.userManager.getUserInfoSync()
                if (userInfo == null) {
                    try {
                        val result = ClawCodeApplication.authRepository.getUserInfo()
                        result.onFailure {
                            android.util.Log.w("AuthCheck", "获取用户信息失败: ${it.message}")
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("AuthCheck", "获取用户信息异常", e)
                    }
                }
                onAuthenticated()
            } else {
                onNotAuthenticated()
            }
        } catch (e: Exception) {
            android.util.Log.e("AuthCheck", "认证检查异常", e)
            onNotAuthenticated()
        } finally {
            isChecking = false
        }
    }

    if (isChecking) {
        AppSplashScreen(message = "正在检查登录状态...")
    }
}

/**
 * 聊天主界面
 * 加载完成前显示精美启动动画，完成后 Crossfade 平滑过渡到会话列表
 *
 * @param currentTheme 当前主题模式
 * @param onThemeChange 主题变更回调
 * @param onLogout 登出回调
 * @param onNavigateToLogin 跳转到登录页面回调
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatMainScreen(
    currentTheme: ThemeMode,
    onThemeChange: (ThemeMode) -> Unit,
    currentBubbleTheme: BubbleTheme,
    onBubbleThemeChange: (BubbleTheme) -> Unit,
    onLogout: () -> Unit,
    onNavigateToLogin: () -> Unit
) {
    val sessionViewModel: SessionViewModel = viewModel(
        factory = SessionViewModel.provideFactory(
            cachedChatRepository = ClawCodeApplication.cachedChatRepository,
            tokenManager = ClawCodeApplication.tokenManager
        )
    )

    val context = androidx.compose.ui.platform.LocalContext.current
    val pushMessageStore = remember { PushMessageStore.getInstance(context) }

    val chatViewModel: ChatViewModel = viewModel(
        factory = ChatViewModel.provideFactory(
            cachedChatRepository = ClawCodeApplication.cachedChatRepository,
            tokenManager = ClawCodeApplication.tokenManager,
            sessionLocalStore = ClawCodeApplication.sessionLocalStore,
            notificationManager = ClawCodeApplication.notificationManager,
            pushMessageStore = pushMessageStore
        )
    )

    chatViewModel.onConvertLocalSession = { tempSessionId ->
        sessionViewModel.createRealSession(tempSessionId)
    }

    var selectedSessionId by remember { mutableStateOf<String?>(null) }
    var showSessionList by remember { mutableStateOf(true) }
    var showExitDialog by remember { mutableStateOf(false) }
    var isNewSession by remember { mutableStateOf(false) }
    var showSettingsDrawer by remember { mutableStateOf(false) }

    val sessionUiState by sessionViewModel.uiState.collectAsStateWithLifecycle()
    val syncState by sessionViewModel.syncState.collectAsStateWithLifecycle()

    val isDataReady = sessionUiState is SessionViewModel.UiState.Success &&
            (syncState is SessionViewModel.SyncState.Completed ||
                    syncState is SessionViewModel.SyncState.Failed ||
                    syncState is SessionViewModel.SyncState.Idle)

    val syncMessage = when (syncState) {
        is SessionViewModel.SyncState.Checking -> "正在检查数据..."
        is SessionViewModel.SyncState.Syncing -> {
            val s = syncState as SessionViewModel.SyncState.Syncing
            "正在同步聊天数据 (${s.current}/${s.total})"
        }
        else -> null
    }

    LaunchedEffect(Unit) {
        sessionViewModel.loadSessions()
        sessionViewModel.startFullSync()
    }

    val scope = rememberCoroutineScope()

    BackHandler(enabled = true) {
        if (!showSessionList && selectedSessionId != null) {
            chatViewModel.clearSession()
            selectedSessionId = null
            showSessionList = true
        } else if (showSessionList) {
            showExitDialog = true
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Crossfade(
            targetState = isDataReady,
            animationSpec = tween(500),
            label = "mainCrossfade"
        ) { ready ->
            if (!ready) {
                AppSplashScreen(
                    message = syncMessage ?: "正在加载会话..."
                )
            } else {
                val state = sessionUiState as? SessionViewModel.UiState.Success
                if (state != null) {
                    AnimatedVisibility(
                        visible = showSessionList || selectedSessionId == null,
                        enter = slideInHorizontally { -it },
                        exit = slideOutHorizontally { -it }
                    ) {
                        Surface(
                            modifier = Modifier.fillMaxSize(),
                            color = AppColor.current.Background
                        ) {
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
                                    val newSessionId = sessionViewModel.createNewSession()
                                    chatViewModel.initNewSession(newSessionId, isLocalOnly = true)
                                    selectedSessionId = newSessionId
                                    isNewSession = true
                                    showSessionList = false
                                },
                                onDelete = { sessionId ->
                                    sessionViewModel.deleteSession(sessionId)
                                },
                                onPin = { sessionId, isPinned ->
                                    sessionViewModel.pinSession(sessionId, isPinned)
                                },
                                onRename = { sessionId, newTitle ->
                                    sessionViewModel.renameSession(sessionId, newTitle)
                                },
                                onAvatarClick = { showSettingsDrawer = true },
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }

                    AnimatedVisibility(
                        visible = selectedSessionId != null && !showSessionList,
                        enter = slideInHorizontally { it },
                        exit = slideOutHorizontally { it }
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
                }
            }
        }

        SettingsDrawer(
            isVisible = showSettingsDrawer,
            onDismiss = { showSettingsDrawer = false },
            onThemeChange = onThemeChange,
            currentTheme = currentTheme,
            currentBubbleTheme = currentBubbleTheme,
            onBubbleThemeChange = onBubbleThemeChange,
            onLogout = onLogout,
            onNavigateToLogin = onNavigateToLogin,
            chatViewModel = chatViewModel
        )
    }

    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            containerColor = AppColor.current.Surface,
            titleContentColor = AppColor.current.TextPrimary,
            textContentColor = AppColor.current.TextSecondary,
            title = { Text("确认退出") },
            text = { Text("确定要退出应用吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showExitDialog = false
                        if (android.os.Process.myPid() > 0) {
                            android.os.Process.killProcess(android.os.Process.myPid())
                        }
                    }
                ) {
                    Text("退出", color = AppColor.current.Error)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showExitDialog = false }
                ) {
                    Text("取消", color = AppColor.current.Primary)
                }
            }
        )
    }
}
