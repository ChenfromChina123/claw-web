package com.example.claw_code_application.ui.chat.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.claw_code_application.data.api.models.RemoteWorker
import com.example.claw_code_application.data.local.UserManager
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.ui.theme.BubbleTheme
import com.example.claw_code_application.util.NetworkConfig
import com.example.claw_code_application.viewmodel.RemoteWorkerViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 设置侧栏组件
 * 从左侧滑入显示，提供应用设置功能
 *
 * @param isVisible 是否显示侧栏
 * @param onDismiss 关闭侧栏回调
 * @param onThemeChange 主题变更回调
 * @param currentTheme 当前主题模式
 * @param onLogout 登出回调
 * @param onNavigateToLogin 跳转到登录页面回调
 * @param modifier 修饰符
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsDrawer(
    isVisible: Boolean,
    onDismiss: () -> Unit,
    onThemeChange: (ThemeMode) -> Unit,
    currentTheme: ThemeMode,
    currentBubbleTheme: BubbleTheme,
    onBubbleThemeChange: (BubbleTheme) -> Unit,
    onLogout: () -> Unit,
    onNavigateToLogin: () -> Unit,
    modifier: Modifier = Modifier,
    chatViewModel: com.example.claw_code_application.viewmodel.ChatViewModel? = null
) {
    val colors = AppColor.current
    val context = androidx.compose.ui.platform.LocalContext.current
    val pushMessageStore = remember { com.example.claw_code_application.data.local.PushMessageStore.getInstance(context) }
    val unreadCount by pushMessageStore.unreadCount.collectAsState()
    var showPushMessagesDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // 网站预览弹窗状态
    var websitePreviewUrl by remember { mutableStateOf("") }
    var websitePreviewTitle by remember { mutableStateOf("网站预览") }
    var showWebsitePreview by remember { mutableStateOf(false) }

    // 远程 Worker ViewModel
    val remoteWorkerViewModel: RemoteWorkerViewModel = viewModel(
        factory = RemoteWorkerViewModel.provideFactory()
    )
    val remoteWorkerState by remoteWorkerViewModel.uiState.collectAsStateWithLifecycle()

    // 对话框状态
    var showAddWorkerDialog by remember { mutableStateOf(false) }
    var selectedWorker by remember { mutableStateOf<RemoteWorker?>(null) }

    // 从 UserManager 获取管理员状态
    val userManager = remember { UserManager.getInstance(context) }
    val userInfo by userManager.getUserInfo().collectAsState(initial = null)
    val isAdmin = userInfo?.isAdmin ?: false

    // 首次加载远程 Worker 数据
    LaunchedEffect(Unit) {
        remoteWorkerViewModel.fetchRemoteWorkers()
    }

    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(initialOffsetX = { -it }) + fadeIn(),
        exit = slideOutHorizontally(targetOffsetX = { -it }) + fadeOut(),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.Background.copy(alpha = 0.5f))
                .clickable(onClick = onDismiss)
        ) {
            Surface(
                modifier = Modifier
                    .width(300.dp)
                    .fillMaxHeight()
                    .align(Alignment.CenterStart)
                    .shadow(16.dp, RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp))
                    .clickable(enabled = false) { },
                shape = RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp),
                color = colors.Surface
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                ) {
                    SettingsHeader(onClose = onDismiss)

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    AccountSection(
                        onLogout = onLogout,
                        onNavigateToLogin = onNavigateToLogin
                    )

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    // 消息通知设置项
                    NotificationSettingsItem(
                        unreadCount = unreadCount,
                        onClick = { showPushMessagesDialog = true }
                    )

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    ServerConfigSection()

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    AgentConfigSection(chatViewModel = chatViewModel)

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    ThemeSection(
                        currentTheme = currentTheme,
                        onThemeChange = onThemeChange
                    )

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    BubbleThemeSection(
                        currentBubbleTheme = currentBubbleTheme,
                        onBubbleThemeChange = onBubbleThemeChange
                    )

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    // 远程 Worker 管理区域（仅管理员可见）
                    if (isAdmin) {
                        RemoteWorkerSection(
                            workers = remoteWorkerState.workers,
                            stats = remoteWorkerState.stats,
                            isLoading = remoteWorkerState.isLoading,
                            isAdmin = isAdmin,
                            onRefresh = { remoteWorkerViewModel.fetchRemoteWorkers() },
                            onAddWorker = { showAddWorkerDialog = true },
                            onWorkerClick = { worker -> selectedWorker = worker }
                        )

                        HorizontalDivider(color = colors.Divider, thickness = 1.dp)
                    }

                    // 已部署网站管理（功能待实现）
                    // DeployedSitesSection(
                    //     onPreviewWebsite = { url ->
                    //         websitePreviewUrl = url
                    //         websitePreviewTitle = "网站预览"
                    //         showWebsitePreview = true
                    //     }
                    // )

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    AboutSection()
                }
            }
        }
    }

    // 显示消息列表弹窗
    if (showPushMessagesDialog) {
        PushMessagesDialog(
            onDismiss = { showPushMessagesDialog = false }
        )
    }

    // 添加远程 Worker 对话框
    if (showAddWorkerDialog) {
        AddRemoteWorkerDialog(
            onDismiss = {
                showAddWorkerDialog = false
                remoteWorkerViewModel.resetDeployState()
            },
            onPrecheck = { host, port, username, password, workerPort ->
                remoteWorkerViewModel.precheckRemoteWorker(host, port, username, password, workerPort)
            },
            onDeploy = { host, port, username, password, workerPort ->
                remoteWorkerViewModel.deployRemoteWorker(host, port, username, password, workerPort)
            },
            precheckResult = remoteWorkerState.precheckResult,
            isPrechecking = remoteWorkerState.isPrechecking,
            isDeploying = remoteWorkerState.isDeploying,
            precheckPassed = remoteWorkerState.precheckPassed
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

    // 显示错误提示
    if (remoteWorkerState.error != null) {
        LaunchedEffect(remoteWorkerState.error) {
            scope.launch {
                // 可以在这里显示 Snackbar 提示
                remoteWorkerViewModel.clearError()
            }
        }
    }

    // 部署成功提示
    if (remoteWorkerState.deploySuccess) {
        LaunchedEffect(remoteWorkerState.deploySuccess) {
            showAddWorkerDialog = false
            remoteWorkerViewModel.resetDeployState()
        }
    }

    // Worker 详情对话框
    selectedWorker?.let { worker ->
        RemoteWorkerDetailDialog(
            worker = worker,
            onDismiss = { selectedWorker = null },
            onRemove = { workerId ->
                remoteWorkerViewModel.removeRemoteWorker(workerId)
                selectedWorker = null
            },
            isAdmin = isAdmin
        )
    }
}

/**
 * 设置头部
 * @param onClose 关闭回调
 */
@Composable
private fun SettingsHeader(
    onClose: () -> Unit
) {
    val colors = AppColor.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Settings,
                contentDescription = null,
                tint = colors.TextPrimary,
                modifier = Modifier.size(24.dp)
            )
            Text(
                text = "设置",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.TextPrimary
            )
        }

        IconButton(onClick = onClose) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "关闭",
                tint = colors.TextSecondary
            )
        }
    }
}

/**
 * 消息通知设置项
 * 显示在设置列表中，替代原来的顶部铃铛按钮
 */
@Composable
private fun NotificationSettingsItem(
    unreadCount: Int,
    onClick: () -> Unit
) {
    val colors = AppColor.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = if (unreadCount > 0) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                contentDescription = null,
                tint = if (unreadCount > 0) colors.Primary else colors.TextSecondary,
                modifier = Modifier.size(22.dp)
            )
            Text(
                text = "消息通知",
                fontSize = 15.sp,
                color = colors.TextPrimary
            )
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // 未读数量徽章
            if (unreadCount > 0) {
                Badge(
                    containerColor = colors.Error
                ) {
                    Text(
                        text = if (unreadCount > 99) "99+" else unreadCount.toString(),
                        fontSize = 12.sp,
                        color = Color.White
                    )
                }
            }

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = colors.TextSecondary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

/**
 * 服务器配置区域
 */
@Composable
private fun ServerConfigSection() {
    val colors = AppColor.current
    var ipAddress by remember { mutableStateOf(NetworkConfig.getCustomIpAddress() ?: "") }
    var port by remember { mutableStateOf(NetworkConfig.getPort().toString()) }
    var isUsingCustomIp by remember { mutableStateOf(NetworkConfig.isUsingCustomIp()) }
    var showSuccess by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(16.dp)
    ) {
        Text(
            text = "服务器配置",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = colors.TextSecondary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "自定义服务器",
                fontSize = 15.sp,
                color = colors.TextPrimary
            )
            Switch(
                checked = isUsingCustomIp,
                onCheckedChange = { enabled ->
                    isUsingCustomIp = enabled
                    if (!enabled) {
                        NetworkConfig.clearCustomIpAddress()
                    }
                },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = colors.Primary,
                    checkedTrackColor = colors.Primary.copy(alpha = 0.3f)
                )
            )
        }

        if (isUsingCustomIp) {
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = ipAddress,
                onValueChange = { ipAddress = it },
                label = { Text("IP地址", fontSize = 12.sp) },
                placeholder = { Text("例如: 192.168.1.100", fontSize = 12.sp) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = colors.Primary,
                    unfocusedBorderColor = colors.Border
                )
            )

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = port,
                onValueChange = { port = it.filter { char -> char.isDigit() } },
                label = { Text("端口", fontSize = 12.sp) },
                placeholder = { Text("默认: 13000", fontSize = 12.sp) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = colors.Primary,
                    unfocusedBorderColor = colors.Border
                )
            )

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = {
                    val ip = ipAddress.trim()
                    val portInt = port.toIntOrNull() ?: 3000
                    if (ip.isNotEmpty()) {
                        NetworkConfig.setCustomIpAddress(ip, portInt)
                        showSuccess = true
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colors.Primary
                )
            ) {
                Text("保存配置", fontSize = 14.sp)
            }

            if (showSuccess) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "配置已保存，应用重启后生效",
                    fontSize = 12.sp,
                    color = colors.Success
                )
                LaunchedEffect(showSuccess) {
                    kotlinx.coroutines.delay(2000)
                    showSuccess = false
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        val currentUrl = NetworkConfig.getBaseUrl()
        Text(
            text = "当前服务器: $currentUrl",
            fontSize = 11.sp,
            color = colors.TextSecondary
        )
    }
}

/**
 * 主题配置区域
 */
@Composable
private fun ThemeSection(
    currentTheme: ThemeMode,
    onThemeChange: (ThemeMode) -> Unit
) {
    val colors = AppColor.current
    
    Column(
        modifier = Modifier.padding(16.dp)
    ) {
        Text(
            text = "外观",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = colors.TextSecondary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        ThemeOption(
            title = "浅色模式",
            icon = Icons.Default.LightMode,
            isSelected = currentTheme == ThemeMode.LIGHT,
            onClick = { onThemeChange(ThemeMode.LIGHT) }
        )

        ThemeOption(
            title = "深色模式",
            icon = Icons.Default.DarkMode,
            isSelected = currentTheme == ThemeMode.DARK,
            onClick = { onThemeChange(ThemeMode.DARK) }
        )

        ThemeOption(
            title = "跟随系统",
            icon = Icons.Default.Smartphone,
            isSelected = currentTheme == ThemeMode.SYSTEM,
            onClick = { onThemeChange(ThemeMode.SYSTEM) }
        )
    }
}

/**
 * 主题选项
 */
@Composable
private fun ThemeOption(
    title: String,
    icon: ImageVector,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val colors = AppColor.current
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (isSelected) colors.Primary.copy(alpha = 0.1f)
                else Color.Transparent
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isSelected) colors.Primary else colors.TextSecondary,
                modifier = Modifier.size(20.dp)
            )
            Text(
                text = title,
                fontSize = 14.sp,
                color = if (isSelected) colors.Primary else colors.TextPrimary
            )
        }

        if (isSelected) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = colors.Primary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

/**
 * 气泡主题配置区域
 */
@Composable
private fun BubbleThemeSection(
    currentBubbleTheme: BubbleTheme,
    onBubbleThemeChange: (BubbleTheme) -> Unit
) {
    val colors = AppColor.current

    Column(
        modifier = Modifier.padding(16.dp)
    ) {
        Text(
            text = "气泡主题",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = colors.TextSecondary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        BubbleTheme.values().forEach { theme ->
            BubbleThemeOption(
                theme = theme,
                isSelected = currentBubbleTheme == theme,
                onClick = { onBubbleThemeChange(theme) }
            )
        }
    }
}

/**
 * 气泡主题选项
 */
@Composable
private fun BubbleThemeOption(
    theme: BubbleTheme,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val colors = AppColor.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (isSelected) colors.Primary.copy(alpha = 0.1f)
                else Color.Transparent
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(theme.previewColor)
            )
            Text(
                text = theme.displayName,
                fontSize = 14.sp,
                color = if (isSelected) colors.Primary else colors.TextPrimary
            )
        }

        if (isSelected) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = colors.Primary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

/**
 * 关于区域
 */
@Composable
private fun AboutSection() {
    val colors = AppColor.current
    
    Column(
        modifier = Modifier.padding(16.dp)
    ) {
        Text(
            text = "关于",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = colors.TextSecondary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        SettingsItem(
            title = "版本",
            value = "1.0.0"
        )

        SettingsItem(
            title = "构建",
            value = "Release"
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Claw Code Application",
            fontSize = 12.sp,
            color = colors.TextSecondary
        )
        Text(
            text = "基于 Manus AI 智能体",
            fontSize = 11.sp,
            color = colors.TextSecondary.copy(alpha = 0.7f)
        )
    }
}

/**
 * 设置项
 */
@Composable
private fun SettingsItem(
    title: String,
    value: String
) {
    val colors = AppColor.current
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 14.sp,
            color = colors.TextPrimary
        )
        Text(
            text = value,
            fontSize = 14.sp,
            color = colors.TextSecondary
        )
    }
}

/**
 * 账号管理区域
 * 显示当前登录用户信息并提供登出功能
 *
 * @param onLogout 登出回调
 * @param onNavigateToLogin 跳转到登录页面回调
 */
@Composable
private fun AccountSection(
    onLogout: () -> Unit,
    onNavigateToLogin: () -> Unit
) {
    val colors = AppColor.current
    val context = androidx.compose.ui.platform.LocalContext.current
    val userManager = remember { UserManager.getInstance(context) }
    val userInfo by userManager.getUserInfo().collectAsState(initial = null)
    var showLogoutConfirm by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(16.dp)
    ) {
        Text(
            text = "账号管理",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = colors.TextSecondary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        if (userInfo != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(colors.Primary.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = colors.Primary,
                        modifier = Modifier.size(28.dp)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = userInfo?.username ?: "",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.TextPrimary
                    )
                    Text(
                        text = userInfo?.email ?: "",
                        fontSize = 12.sp,
                        color = colors.TextSecondary
                    )
                }
            }

            OutlinedButton(
                onClick = { showLogoutConfirm = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = colors.Error
                ),
                border = androidx.compose.foundation.BorderStroke(
                    width = 1.dp,
                    color = colors.Error.copy(alpha = 0.5f)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Logout,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("退出登录", fontSize = 14.sp)
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.Primary.copy(alpha = 0.1f))
                    .clickable { onNavigateToLogin() }
                    .padding(horizontal = 12.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.AccountCircle,
                    contentDescription = null,
                    tint = colors.Primary,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = "未登录",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = colors.TextPrimary
                    )
                    Text(
                        text = "点击登录账号",
                        fontSize = 12.sp,
                        color = colors.TextSecondary
                    )
                }
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = colors.TextSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = {
                Text(
                    text = "确认退出登录",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold
                )
            },
            text = {
                Text(
                    text = "退出登录后，您需要重新登录才能使用完整功能。",
                    fontSize = 14.sp,
                    color = colors.TextSecondary
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutConfirm = false
                        onLogout()
                    }
                ) {
                    Text(
                        text = "确认退出",
                        color = colors.Error,
                        fontSize = 14.sp
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showLogoutConfirm = false }
                ) {
                    Text(
                        text = "取消",
                        color = colors.TextSecondary,
                        fontSize = 14.sp
                    )
                }
            },
            containerColor = colors.Surface,
            titleContentColor = colors.TextPrimary,
            textContentColor = colors.TextSecondary
        )
    }
}

/**
 * Agent 配置区域
 * 提供最大循环次数等 Agent 相关设置
 */
@Composable
private fun AgentConfigSection(
    chatViewModel: com.example.claw_code_application.viewmodel.ChatViewModel?
) {
    val colors = AppColor.current
    var maxIterations by remember {
        mutableStateOf(chatViewModel?.maxIterations?.toString() ?: "30")
    }

    Column(
        modifier = Modifier.padding(16.dp)
    ) {
        Text(
            text = "Agent 设置",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = colors.TextSecondary,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "最大循环次数",
                    fontSize = 15.sp,
                    color = colors.TextPrimary
                )
                Text(
                    text = "Agent 执行工具调用的最大轮次 (1-100)",
                    fontSize = 11.sp,
                    color = colors.TextSecondary
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            OutlinedTextField(
                value = maxIterations,
                onValueChange = { input ->
                    val filtered = input.filter { it.isDigit() }
                    val num = filtered.toIntOrNull()
                    if (num != null && num in 1..100) {
                        maxIterations = filtered
                        chatViewModel?.setMaxIterations(num)
                    } else if (filtered.isEmpty()) {
                        maxIterations = ""
                    }
                },
                modifier = Modifier.width(80.dp),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(8.dp),
                textStyle = androidx.compose.ui.text.TextStyle(
                    fontSize = 14.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = colors.Primary,
                    unfocusedBorderColor = colors.Border
                )
            )
        }
    }
}

/**
 * 主题模式枚举
 */
enum class ThemeMode {
    LIGHT,
    DARK,
    SYSTEM
}
