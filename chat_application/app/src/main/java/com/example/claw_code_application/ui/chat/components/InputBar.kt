package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 输入框组件
 * 基于原型Manus风格设计 - 浅色主题
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InputBar(
    onSend: (String) -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier
) {
    var text by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = AppColor.SurfaceDark,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 添加按钮 - 原型样式
            Surface(
                modifier = Modifier.size(32.dp),
                shape = RoundedCornerShape(16.dp),
                color = AppColor.SurfaceLight
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = "+",
                        fontSize = 20.sp,
                        color = AppColor.TextPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // 文本输入框 - 原型样式
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(20.dp),
                color = AppColor.SurfaceLight
            ) {
                TextField(
                    value = text,
                    onValueChange = { 
                        if (it.length <= 2000) {
                            text = it 
                        }
                    },
                    modifier = Modifier.heightIn(min = 40.dp, max = 120.dp),
                    placeholder = { 
                        Text(
                            "向 Manus 发送消息...",
                            color = AppColor.TextSecondary,
                            fontSize = 14.sp
                        ) 
                    },
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = AppColor.SurfaceLight,
                        unfocusedContainerColor = AppColor.SurfaceLight,
                        disabledContainerColor = AppColor.SurfaceLight,
                        focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                        unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                        cursorColor = AppColor.Primary,
                        focusedTextColor = AppColor.TextPrimary,
                        unfocusedTextColor = AppColor.TextPrimary,
                        disabledTextColor = AppColor.TextSecondary
                    ),
                    singleLine = false,
                    maxLines = 5,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(
                        onSend = {
                            if (text.isNotBlank() && enabled) {
                                onSend(text.trim())
                                text = ""
                                focusManager.clearFocus()
                            }
                        }
                    ),
                    enabled = enabled
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // 发送按钮 - 原型样式
            if (text.isNotBlank() && enabled) {
                IconButton(
                    onClick = {
                        if (text.isNotBlank() && enabled) {
                            onSend(text.trim())
                            text = ""
                            focusManager.clearFocus()
                        }
                    },
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "发送",
                        tint = AppColor.Primary
                    )
                }
            }
        }
    }
}
