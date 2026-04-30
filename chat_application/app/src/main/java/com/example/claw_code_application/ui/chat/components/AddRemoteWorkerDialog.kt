package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.claw_code_application.data.api.models.EnvironmentCheckItem

/**
 * 添加远程 Worker 对话框
 */
@Composable
fun AddRemoteWorkerDialog(
    onDismiss: () -> Unit,
    onPrecheck: (host: String, port: Int, username: String, password: String, workerPort: Int) -> Unit,
    onDeploy: (host: String, port: Int, username: String, password: String, workerPort: Int) -> Unit,
    precheckResult: List<EnvironmentCheckItem>?,
    isPrechecking: Boolean,
    isDeploying: Boolean,
    precheckPassed: Boolean?
) {
    var host by remember { mutableStateOf("") }
    var sshPort by remember { mutableStateOf("22") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var workerPort by remember { mutableStateOf("4000") }
    var passwordVisible by remember { mutableStateOf(false) }
    var showPrecheckResult by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = { if (!isDeploying) onDismiss() }) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // 标题
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.AddCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp)
                    )
                    Text(
                        text = "添加远程 Worker",
                        style = MaterialTheme.typography.headlineSmall
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // 主机地址
                OutlinedTextField(
                    value = host,
                    onValueChange = { host = it },
                    label = { Text("主机地址 *") },
                    placeholder = { Text("例如: 192.168.1.100") },
                    leadingIcon = {
                        Icon(Icons.Default.Computer, contentDescription = null)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !isPrechecking && !isDeploying
                )

                Spacer(modifier = Modifier.height(12.dp))

                // SSH 端口和 Worker 端口
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = sshPort,
                        onValueChange = { sshPort = it.filter { c -> c.isDigit() } },
                        label = { Text("SSH 端口") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        enabled = !isPrechecking && !isDeploying
                    )

                    OutlinedTextField(
                        value = workerPort,
                        onValueChange = { workerPort = it.filter { c -> c.isDigit() } },
                        label = { Text("Worker 端口") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        enabled = !isPrechecking && !isDeploying
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // 用户名
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("用户名 *") },
                    placeholder = { Text("例如: root") },
                    leadingIcon = {
                        Icon(Icons.Default.Person, contentDescription = null)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !isPrechecking && !isDeploying
                )

                Spacer(modifier = Modifier.height(12.dp))

                // 密码
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("密码 *") },
                    leadingIcon = {
                        Icon(Icons.Default.Lock, contentDescription = null)
                    },
                    trailingIcon = {
                        IconButton(
                            onClick = { passwordVisible = !passwordVisible },
                            enabled = !isPrechecking && !isDeploying
                        ) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "隐藏密码" else "显示密码"
                            )
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !isPrechecking && !isDeploying
                )

                Spacer(modifier = Modifier.height(16.dp))

                // 环境检查结果
                if (showPrecheckResult && precheckResult != null) {
                    PrecheckResultCard(
                        checks = precheckResult,
                        passed = precheckPassed == true
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // 按钮
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        enabled = !isDeploying
                    ) {
                        Text("取消")
                    }

                    if (precheckPassed != true) {
                        Button(
                            onClick = {
                                showPrecheckResult = true
                                onPrecheck(
                                    host,
                                    sshPort.toIntOrNull() ?: 22,
                                    username,
                                    password,
                                    workerPort.toIntOrNull() ?: 4000
                                )
                            },
                            modifier = Modifier.weight(1f),
                            enabled = host.isNotBlank() &&
                                    username.isNotBlank() &&
                                    password.isNotBlank() &&
                                    !isPrechecking &&
                                    !isDeploying
                        ) {
                            if (isPrechecking) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                            } else {
                                Text("环境检查")
                            }
                        }
                    } else {
                        Button(
                            onClick = {
                                onDeploy(
                                    host,
                                    sshPort.toIntOrNull() ?: 22,
                                    username,
                                    password,
                                    workerPort.toIntOrNull() ?: 4000
                                )
                            },
                            modifier = Modifier.weight(1f),
                            enabled = !isDeploying
                        ) {
                            if (isDeploying) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                            } else {
                                Text("部署")
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * 环境检查结果卡片
 */
@Composable
private fun PrecheckResultCard(
    checks: List<EnvironmentCheckItem>,
    passed: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (passed) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            } else {
                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
            }
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            // 总体结果
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = if (passed) Icons.Default.CheckCircle else Icons.Default.Error,
                    contentDescription = null,
                    tint = if (passed) androidx.compose.ui.graphics.Color(0xFF4CAF50)
                    else MaterialTheme.colorScheme.error
                )
                Text(
                    text = if (passed) "环境检查通过" else "环境检查未通过",
                    style = MaterialTheme.typography.titleSmall,
                    color = if (passed) androidx.compose.ui.graphics.Color(0xFF4CAF50)
                    else MaterialTheme.colorScheme.error
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // 详细检查项
            checks.forEach { check ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(vertical = 2.dp)
                ) {
                    Icon(
                        imageVector = if (check.passed) Icons.Default.Check else Icons.Default.Close,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = if (check.passed) androidx.compose.ui.graphics.Color(0xFF4CAF50)
                        else MaterialTheme.colorScheme.error
                    )
                    Text(
                        text = check.message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
