package com.example.claw_code_application.ui.chat.components

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 输入框组件
 * 基于原型Manus风格设计 - 浅色主题
 * 集成底部抽屉弹出和语音输入功能
 *
 * @param onSend 发送消息回调
 * @param enabled 是否启用输入
 * @param onAddClick "+"按钮点击回调（弹出底部抽屉）
 * @param modifier 修饰符
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InputBar(
    onSend: (String) -> Unit,
    enabled: Boolean = true,
    onAddClick: () -> Unit = {},
    onImageSelected: ((Uri) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var text by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current

    var isListening by remember { mutableStateOf(false) }
    var speechRecognizer by remember { mutableStateOf<SpeechRecognizer?>(null) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        uri?.let { onImageSelected?.invoke(it) }
    }

    DisposableEffect(Unit) {
        onDispose {
            speechRecognizer?.destroy()
        }
    }

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
            AddButton(onClick = {
                if (onImageSelected != null) {
                    photoPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                } else {
                    onAddClick()
                }
            })

            Spacer(modifier = Modifier.width(12.dp))

            InputField(
                text = text,
                onTextChange = {
                    if (it.length <= 2000) {
                        text = it
                    }
                },
                onSend = {
                    if (text.isNotBlank() && enabled) {
                        onSend(text.trim())
                        text = ""
                        focusManager.clearFocus()
                    }
                },
                enabled = enabled,
                modifier = Modifier.weight(1f)
            )

            Spacer(modifier = Modifier.width(8.dp))

            if (text.isNotBlank() && enabled) {
                SendButton(
                    onClick = {
                        if (text.isNotBlank() && enabled) {
                            onSend(text.trim())
                            text = ""
                            focusManager.clearFocus()
                        }
                    }
                )
            } else {
                VoiceInputButton(
                    isListening = isListening,
                    onStartListening = {
                        startVoiceInput(
                            context = context,
                            speechRecognizer = speechRecognizer,
                            onResult = { recognizedText ->
                                text = recognizedText
                                isListening = false
                            },
                            onReady = { sr ->
                                speechRecognizer = sr
                                isListening = true
                            },
                            onError = {
                                isListening = false
                            }
                        )
                    },
                    onStopListening = {
                        speechRecognizer?.stopListening()
                        isListening = false
                    }
                )
            }
        }
    }
}

/**
 * "+"添加按钮 - 点击弹出底部抽屉
 */
@Composable
private fun AddButton(onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .size(32.dp)
            .clickable(onClick = onClick),
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
}

/**
 * 文本输入框
 */
@Composable
private fun InputField(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    val focusManager = LocalFocusManager.current

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = AppColor.SurfaceLight
    ) {
        TextField(
            value = text,
            onValueChange = onTextChange,
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
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
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
                    onSend()
                }
            ),
            enabled = enabled
        )
    }
}

/**
 * 发送按钮
 */
@Composable
private fun SendButton(onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier.size(40.dp)
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Send,
            contentDescription = "发送",
            tint = AppColor.Primary
        )
    }
}

/**
 * 语音输入按钮
 * Manus风格：麦克风图标，录音时有脉冲动画
 *
 * @param isListening 是否正在录音
 * @param onStartListening 开始录音回调
 * @param onStopListening 停止录音回调
 */
@Composable
private fun VoiceInputButton(
    isListening: Boolean,
    onStartListening: () -> Unit,
    onStopListening: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "voice_pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.4f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "voice_pulse_alpha"
    )

    IconButton(
        onClick = {
            if (isListening) {
                onStopListening()
            } else {
                onStartListening()
            }
        },
        modifier = Modifier.size(40.dp)
    ) {
        if (isListening) {
            Box(contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(
                            color = AppColor.Primary.copy(alpha = pulseAlpha * 0.2f),
                            shape = CircleShape
                        )
                )
                Icon(
                    imageVector = Icons.Default.Mic,
                    contentDescription = "停止录音",
                    tint = AppColor.Primary,
                    modifier = Modifier.size(24.dp)
                )
            }
        } else {
            Icon(
                imageVector = Icons.Default.Mic,
                contentDescription = "语音输入",
                tint = AppColor.TextSecondary
            )
        }
    }
}

/**
 * 启动语音识别
 * 使用Android原生SpeechRecognizer
 */
private fun startVoiceInput(
    context: android.content.Context,
    speechRecognizer: SpeechRecognizer?,
    onResult: (String) -> Unit,
    onReady: (SpeechRecognizer) -> Unit,
    onError: () -> Unit
) {
    if (!SpeechRecognizer.isRecognitionAvailable(context)) {
        onError()
        return
    }

    speechRecognizer?.destroy()

    val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }

    recognizer.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onError(error: Int) {
            onError()
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            if (!matches.isNullOrEmpty()) {
                onResult(matches[0])
            } else {
                onError()
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    })

    onReady(recognizer)
    recognizer.startListening(intent)
}
