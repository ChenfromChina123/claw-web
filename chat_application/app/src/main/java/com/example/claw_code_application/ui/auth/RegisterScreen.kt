package com.example.claw_code_application.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
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
 * 注册页面
 * 支持主题切换，包含邮箱、用户名、密码、验证码输入框
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(
    viewModel: AuthViewModel,
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit
) {
    val colors = AppColor.current
    var email by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }
    
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    LaunchedEffect(uiState) {
        if (uiState is AuthViewModel.UiState.Success) {
            onRegisterSuccess()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.Background),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = colors.Surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "创建账户",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.TextPrimary,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                
                Text(
                    text = "填写以下信息完成注册",
                    fontSize = 14.sp,
                    color = colors.TextSecondary,
                    modifier = Modifier.padding(bottom = 24.dp)
                )

                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("邮箱地址", color = colors.TextSecondary) },
                    leadingIcon = {
                        Icon(Icons.Default.Email, contentDescription = "邮箱", tint = colors.TextSecondary)
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                    colors = textFieldColors(colors),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("用户名", color = colors.TextSecondary) },
                    leadingIcon = {
                        Icon(Icons.Default.Person, contentDescription = "用户名", tint = colors.TextSecondary)
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                    colors = textFieldColors(colors),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = password,
                    onValueChange = { 
                        if (it.length <= 32) password = it 
                    },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("密码（6-32位）", color = colors.TextSecondary) },
                    leadingIcon = {
                        Icon(Icons.Default.Lock, contentDescription = "密码", tint = colors.TextSecondary)
                    },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "隐藏密码" else "显示密码",
                                tint = colors.TextSecondary
                            )
                        }
                    },
                    singleLine = true,
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                    colors = textFieldColors(colors),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { 
                        if (it.length <= 32) confirmPassword = it 
                    },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("确认密码", color = colors.TextSecondary) },
                    leadingIcon = {
                        Icon(Icons.Default.Lock, contentDescription = "确认密码", tint = colors.TextSecondary)
                    },
                    trailingIcon = {
                        IconButton(onClick = { confirmPasswordVisible = !confirmPasswordVisible }) {
                            Icon(
                                imageVector = if (confirmPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (confirmPasswordVisible) "隐藏密码" else "显示密码",
                                tint = colors.TextSecondary
                            )
                        }
                    },
                    singleLine = true,
                    visualTransformation = if (confirmPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                    colors = textFieldColors(colors),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = code,
                        onValueChange = { 
                            if (it.length <= 6) code = it 
                        },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("验证码", color = colors.TextSecondary) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        colors = textFieldColors(colors),
                        shape = RoundedCornerShape(12.dp)
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    Button(
                        onClick = { },
                        enabled = email.isNotBlank() && uiState !is AuthViewModel.UiState.Loading,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (email.isNotBlank()) colors.Primary else colors.SurfaceVariant
                        ),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                        modifier = Modifier.heightIn(min = 48.dp)
                    ) {
                        Text(
                            text = "获取验证码",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                if (uiState is AuthViewModel.UiState.Error) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = (uiState as AuthViewModel.UiState.Error).message,
                        color = colors.Error,
                        fontSize = 12.sp,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        when {
                            email.isBlank() -> return@Button
                            username.isBlank() -> return@Button
                            password.isBlank() -> return@Button
                            confirmPassword != password -> return@Button
                            code.isBlank() -> return@Button
                            else -> viewModel.register(email, username, password, code)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    enabled = uiState !is AuthViewModel.UiState.Loading && 
                             email.isNotBlank() && 
                             username.isNotBlank() && 
                             password.isNotBlank() &&
                             password == confirmPassword &&
                             code.isNotBlank(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = colors.Primary)
                ) {
                    if (uiState is AuthViewModel.UiState.Loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = colors.TextPrimary
                        )
                    } else {
                        Text(
                            text = "注 册",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "已有账户？",
                        color = colors.TextSecondary,
                        fontSize = 14.sp
                    )
                    
                    TextButton(onClick = onNavigateToLogin) {
                        Text(
                            text = "立即登录",
                            color = colors.Primary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}

/**
 * 统一的文本框颜色配置
 */
@Composable
private fun textFieldColors(colors: com.example.claw_code_application.ui.theme.AppColors) = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = colors.Primary,
    unfocusedBorderColor = colors.Border,
    cursorColor = colors.Primary,
    focusedTextColor = colors.TextPrimary,
    unfocusedTextColor = colors.TextPrimary
)
