package com.example.claw_code_application.ui.chat.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.claw_code_application.ui.theme.AppColor
import com.example.claw_code_application.util.FileInfo
import com.example.claw_code_application.util.FileUploadHelper
import kotlinx.coroutines.launch

/**
 * 文件选择器对话框
 * 支持选择多个文件并显示文件列表
 *
 * @param onDismiss 关闭回调
 * @param onFilesSelected 文件选择完成回调
 * @param sessionId 当前会话ID
 */
@Composable
fun FilePickerDialog(
    onDismiss: () -> Unit,
    onFilesSelected: (List<FileInfo>) -> Unit,
    sessionId: String
) {
    val colors = AppColor.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var selectedFiles by remember { mutableStateOf<List<FileInfo>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // 文件选择器启动器
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            scope.launch {
                isLoading = true
                errorMessage = null
                try {
                    val files = FileUploadHelper.readFilesFromUris(context, uris)
                    // 过滤不允许的文件类型
                    val allowedFiles = files.filter { fileInfo ->
                        val isAllowed = FileUploadHelper.isAllowedFileType(fileInfo.name)
                        if (!isAllowed) {
                            errorMessage = "文件 ${fileInfo.name} 类型不允许上传"
                        }
                        isAllowed
                    }
                    selectedFiles = selectedFiles + allowedFiles
                } catch (e: Exception) {
                    errorMessage = "读取文件失败: ${e.message}"
                } finally {
                    isLoading = false
                }
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .wrapContentHeight()
                .clip(RoundedCornerShape(16.dp)),
            color = colors.Surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier.padding(20.dp)
            ) {
                // 标题栏
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "选择文件上传到工作区",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.TextPrimary
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "关闭",
                            tint = colors.TextSecondary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // 会话信息
                Text(
                    text = "会话: ${sessionId.take(8)}...",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.TextSecondary
                )

                Spacer(modifier = Modifier.height(16.dp))

                // 错误提示
                AnimatedVisibility(
                    visible = errorMessage != null,
                    enter = fadeIn(),
                    exit = fadeOut()
                ) {
                    errorMessage?.let { message ->
                        Surface(
                            color = colors.Error.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Error,
                                    contentDescription = null,
                                    tint = colors.Error,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = message,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = colors.Error
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                    }
                }

                // 添加文件按钮
                OutlinedButton(
                    onClick = { filePickerLauncher.launch("*/*") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isLoading
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("添加文件")
                }

                Spacer(modifier = Modifier.height(12.dp))

                // 文件列表
                if (selectedFiles.isNotEmpty()) {
                    Text(
                        text = "已选择 ${selectedFiles.size} 个文件",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.TextPrimary
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 200.dp)
                    ) {
                        items(selectedFiles) { fileInfo ->
                            FileListItem(
                                fileInfo = fileInfo,
                                onRemove = {
                                    selectedFiles = selectedFiles.filter { it != fileInfo }
                                },
                                colors = colors
                            )
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(100.dp)
                            .background(
                                color = colors.SurfaceVariant,
                                shape = RoundedCornerShape(8.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "点击上方按钮选择文件",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.TextSecondary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // 底部按钮
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(
                        onClick = onDismiss,
                        enabled = !isLoading
                    ) {
                        Text("取消")
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            if (selectedFiles.isNotEmpty()) {
                                onFilesSelected(selectedFiles)
                            }
                        },
                        enabled = selectedFiles.isNotEmpty() && !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("上传 ${selectedFiles.size} 个文件")
                        }
                    }
                }
            }
        }
    }
}

/**
 * 文件列表项
 */
@Composable
private fun FileListItem(
    fileInfo: FileInfo,
    onRemove: () -> Unit,
    colors: com.example.claw_code_application.ui.theme.AppColors
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        color = colors.SurfaceVariant,
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 文件图标
            Text(
                text = FileUploadHelper.getFileIcon(fileInfo.name),
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(modifier = Modifier.width(12.dp))

            // 文件名和大小
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = fileInfo.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = FileUploadHelper.formatFileSize(fileInfo.size),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.TextSecondary
                )
            }

            // 删除按钮
            IconButton(
                onClick = onRemove,
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "删除",
                    tint = colors.Error,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

/**
 * 文件上传进度对话框
 */
@Composable
fun FileUploadProgressDialog(
    progress: Float,
    uploadedCount: Int,
    totalCount: Int,
    currentFileName: String,
    onCancel: () -> Unit
) {
    val colors = AppColor.current

    Dialog(
        onDismissRequest = { },
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .clip(RoundedCornerShape(16.dp)),
            color = colors.Surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "正在上传文件...",
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.TextPrimary
                )

                Spacer(modifier = Modifier.height(16.dp))

                // 进度条
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                    color = colors.Primary,
                    trackColor = colors.SurfaceVariant
                )

                Spacer(modifier = Modifier.height(12.dp))

                // 进度文本
                Text(
                    text = "$uploadedCount / $totalCount",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.TextSecondary
                )

                Spacer(modifier = Modifier.height(8.dp))

                // 当前文件名
                Text(
                    text = currentFileName,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(20.dp))

                TextButton(onClick = onCancel) {
                    Text("取消")
                }
            }
        }
    }
}

/**
 * 文件上传结果对话框
 */
@Composable
fun FileUploadResultDialog(
    successCount: Int,
    failedCount: Int,
    failedFiles: List<String>,
    onDismiss: () -> Unit
) {
    val colors = AppColor.current

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .clip(RoundedCornerShape(16.dp)),
            color = colors.Surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier.padding(24.dp)
            ) {
                // 标题
                Text(
                    text = "上传完成",
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.TextPrimary
                )

                Spacer(modifier = Modifier.height(16.dp))

                // 成功数量
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = colors.Success,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "成功: $successCount 个文件",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.TextPrimary
                    )
                }

                // 失败数量
                if (failedCount > 0) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Error,
                            contentDescription = null,
                            tint = colors.Error,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "失败: $failedCount 个文件",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.TextPrimary
                        )
                    }

                    // 失败文件列表
                    if (failedFiles.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    color = colors.Error.copy(alpha = 0.1f),
                                    shape = RoundedCornerShape(8.dp)
                                )
                                .padding(12.dp)
                        ) {
                            failedFiles.forEach { fileName ->
                                Text(
                                    text = "• $fileName",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = colors.Error
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // 确定按钮
                Button(
                    onClick = onDismiss,
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text("确定")
                }
            }
        }
    }
}
