package com.example.claw_code_application.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.viewmodel.AuthViewModel

/**
 * 登录页面
 * 暗色主题，居中卡片布局
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    authFailedMessage: String? = null  // 认证失败的消息
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var showAuthFailedDialog by remember { mutableStateOf(authFailedMessage != null) }
    
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    // 监听登录成功状态
    LaunchedEffect(uiState) {
        if (uiState is AuthViewModel.UiState.Success) {
            onLoginSuccess()
        }
    }

    // 显示认证失败对话框
    if (showAuthFailedDialog && authFailedMessage != null) {
        AlertDialog(
            onDismissRequest = { showAuthFailedDialog = false },
            title = { Text("登录已过期", color = AppColor.TextPrimary) },
            text = { Text(authFailedMessage, color = AppColor.TextSecondary) },
            confirmButton = {
                TextButton(onClick = { showAuthFailedDialog = false }) {
                    Text("确定", color = AppColor.Primary)
                }
            },
            containerColor = AppColor.SurfaceDark
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColor.BackgroundDark),
        contentAlignment = Alignment.Center
    ) {
        // 主卡片容器
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = AppColor.SurfaceDark),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // 标题
                Text(
                    text = "欢迎回来",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = AppColor.TextPrimary,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                
                Text(
                    text = "登录您的账户继续使用",
                    fontSize = 14.sp,
                    color = AppColor.TextSecondary,
                    modifier = Modifier.padding(bottom = 32.dp)
                )

                // 邮箱输入框
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("邮箱地址", color = AppColor.TextSecondary) },
                    leadingIcon = {
                        Icon(Icons.Default.Email, contentDescription = "邮箱", tint = AppColor.TextSecondary)
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        imeAction = ImeAction.Next
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Down) }
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AppColor.Primary,
                        unfocusedBorderColor = AppColor.Border,
                        cursorColor = AppColor.Primary,
                        focusedTextColor = AppColor.TextPrimary,
                        unfocusedTextColor = AppColor.TextPrimary
                    ),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // 密码输入框
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("密码", color = AppColor.TextSecondary) },
                    leadingIcon = {
                        Icon(Icons.Default.Lock, contentDescription = "密码", tint = AppColor.TextSecondary)
                    },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "隐藏密码" else "显示密码",
                                tint = AppColor.TextSecondary
                            )
                        }
                    },
                    singleLine = true,
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            if (email.isNotBlank() && password.isNotBlank()) {
                                viewModel.login(email, password)
                            }
                        }
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AppColor.Primary,
                        unfocusedBorderColor = AppColor.Border,
                        cursorColor = AppColor.Primary,
                        focusedTextColor = AppColor.TextPrimary,
                        unfocusedTextColor = AppColor.TextPrimary
                    ),
                    shape = RoundedCornerShape(12.dp)
                )

                // 错误提示
                if (uiState is AuthViewModel.UiState.Error) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = (uiState as AuthViewModel.UiState.Error).message,
                        color = AppColor.Error,
                        fontSize = 12.sp,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                // 登录按钮
                Button(
                    onClick = { viewModel.login(email, password) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    enabled = uiState !is AuthViewModel.UiState.Loading && email.isNotBlank() && password.isNotBlank(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (email.isNotBlank() && password.isNotBlank()) AppColor.Primary else AppColor.SurfaceLight
                    )
                ) {
                    if (uiState is AuthViewModel.UiState.Loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = AppColor.TextPrimary
                        )
                    } else {
                        Text(
                            text = "登 录",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // 注册链接
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "还没有账户？",
                        color = AppColor.TextSecondary,
                        fontSize = 14.sp
                    )
                    
                    TextButton(onClick = onNavigateToRegister) {
                        Text(
                            text = "立即注册",
                            color = AppColor.Primary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}
