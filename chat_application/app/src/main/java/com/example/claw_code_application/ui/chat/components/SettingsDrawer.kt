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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.data.local.UserManager
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.util.NetworkConfig

/**
 * 设置侧栏组件
 * 从右侧滑入显示，提供应用设置功能
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
    onLogout: () -> Unit,
    onNavigateToLogin: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
    val context = androidx.compose.ui.platform.LocalContext.current
    val pushMessageStore = remember { com.example.claw_code_application.data.local.PushMessageStore.getInstance(context) }
    val unreadCount by pushMessageStore.unreadCount.collectAsState()
    var showPushMessagesDialog by remember { mutableStateOf(false) }

    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(initialOffsetX = { it }) + fadeIn(),
        exit = slideOutHorizontally(targetOffsetX = { it }) + fadeOut(),
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
                    .align(Alignment.CenterEnd)
                    .shadow(16.dp, RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp))
                    .clickable(enabled = false) { },
                shape = RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp),
                color = colors.Surface
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                ) {
                    SettingsHeader(
                        onClose = onDismiss,
                        unreadCount = unreadCount,
                        onNotificationClick = {
                            showPushMessagesDialog = true
                        }
                    )

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    AccountSection(
                        onLogout = onLogout,
                        onNavigateToLogin = onNavigateToLogin
                    )

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    ServerConfigSection()

                    HorizontalDivider(color = colors.Divider, thickness = 1.dp)

                    ThemeSection(
                        currentTheme = currentTheme,
                        onThemeChange = onThemeChange
                    )

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
}

/**
 * 设置头部
 * @param onClose 关闭回调
 * @param unreadCount 未读消息数量
 * @param onNotificationClick 通知按钮点击回调
 */
@Composable
private fun SettingsHeader(
    onClose: () -> Unit,
    unreadCount: Int = 0,
    onNotificationClick: () -> Unit = {}
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

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // 通知铃铛按钮
            Box {
                IconButton(onClick = onNotificationClick) {
                    Icon(
                        imageVector = if (unreadCount > 0) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                        contentDescription = "消息通知",
                        tint = if (unreadCount > 0) colors.Primary else colors.TextSecondary,
                        modifier = Modifier.size(24.dp)
                    )
                }

                // 未读数量徽章
                if (unreadCount > 0) {
                    Badge(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 4.dp, end = 4.dp),
                        containerColor = colors.Error
                    ) {
                        Text(
                            text = if (unreadCount > 99) "99+" else unreadCount.toString(),
                            fontSize = 10.sp,
                            color = Color.White
                        )
                    }
                }
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
                    val portInt = port.toIntOrNull() ?: 13000
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
 * 主题模式枚举
 */
enum class ThemeMode {
    LIGHT,
    DARK,
    SYSTEM
}
