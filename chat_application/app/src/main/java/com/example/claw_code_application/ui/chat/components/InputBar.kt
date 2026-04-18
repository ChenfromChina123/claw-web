package com.example.claw_code_application.ui.chat.components

import androidx.compose.foundation.background
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
import com.example.claw_code_application.ui.theme.Color

/**
 * 输入框组件
 * 复刻Vue前端ChatInput.vue的设计风格
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

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        // 文本输入框
        OutlinedTextField(
            value = text,
            onValueChange = { 
                if (it.length <= 2000) {  // 限制最大字符数
                    text = it 
                }
            },
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp, max = 120.dp),
            placeholder = { 
                Text(
                    "输入消息...",
                    color = Color.TextSecondary
                ) 
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color.Primary,
                unfocusedBorderColor = Color.Border,
                cursorColor = Color.Primary,
                focusedTextColor = Color.TextPrimary,
                unfocusedTextColor = Color.TextPrimary
            ),
            shape = RoundedCornerShape(24.dp),
            maxLines = 5,
            keyboardOptions = KeyboardOptions(
                imeAction = ImeAction.Send
            ),
            keyboardActions = KeyboardActions(
                onSend = {
                    if (text.isNotBlank() && enabled) {
                        onSend(text.trim())
                        text = ""
                        focusManager.clearForce()
                    }
                }
            ),
            enabled = enabled
        )

        Spacer(modifier = Modifier.width(8.dp))

        // 发送按钮
        FloatingActionButton(
            onClick = {
                if (text.isNotBlank() && enabled) {
                    onSend(text.trim())
                    text = ""
                    focusManager.clearForce()
                }
            },
            modifier = Modifier.size(48.dp),
            containerColor = if (text.isNotBlank() && enabled) Color.Primary else Color.SurfaceLight,
            contentColor = Color.TextPrimary,
            elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 0.dp),
            shape = RoundedCornerShape(24.dp)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = "发送",
                tint = if (text.isNotBlank() && enabled) Color.TextPrimary else Color.TextSecondary
            )
        }
    }
}
