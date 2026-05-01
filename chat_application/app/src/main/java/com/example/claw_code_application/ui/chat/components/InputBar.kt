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
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.claw_code_application.ui.theme.AppColor

/**
 * 输入框组件 - Manus 1.6 Lite 风格
 * 
 * 设计理念：
 * - 固定在屏幕底部，高度56dp，确保单手可以轻松点击
 * - 触控区域不小于48dp x 48dp
 * - 简洁、克制、专业
 * - 支持主题切换
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InputBar(
    onSend: (String) -> Unit,
    enabled: Boolean = true,
    onAddClick: () -> Unit = {},
    onImageSelected: ((Uri) -> Unit)? = null,
    selectedSkills: List<com.example.claw_code_application.ui.chat.SkillAttachment> = emptyList(),
    onRemoveSkill: (com.example.claw_code_application.ui.chat.SkillAttachment) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val colors = AppColor.current
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

    var isSendPressed by remember { mutableStateOf(false) }
    val sendScale by animateFloatAsState(
        targetValue = if (isSendPressed) 0.9f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "send_scale"
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = colors.Surface,
        shadowElevation = 8.dp
    ) {
        Column {
            if (selectedSkills.isNotEmpty()) {
                SkillChipsRow(
                    skills = selectedSkills,
                    onRemove = onRemoveSkill,
                    colors = colors
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
            AddButton(
                onClick = {
                    if (onImageSelected != null) {
                        photoPickerLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    } else {
                        onAddClick()
                    }
                },
                colors = colors
            )

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
                colors = colors,
                modifier = Modifier.weight(1f)
            )

            Spacer(modifier = Modifier.width(8.dp))

            if (text.isNotBlank() && enabled) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .scale(sendScale),
                    contentAlignment = Alignment.Center
                ) {
                    IconButton(
                        onClick = {
                            isSendPressed = true
                            if (text.isNotBlank() && enabled) {
                                onSend(text.trim())
                                text = ""
                                focusManager.clearFocus()
                            }
                            isSendPressed = false
                        },
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = "发送",
                            tint = colors.Primary,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
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
                    },
                    colors = colors
                )
            }
        }
        }
    }
}

/**
 * "+"添加按钮 - Manus风格：简洁圆形按钮
 */
@Composable
private fun AddButton(
    onClick: () -> Unit,
    colors: com.example.claw_code_application.ui.theme.AppColors
) {
    Surface(
        modifier = Modifier
            .size(36.dp)
            .clickable(onClick = onClick),
        shape = CircleShape,
        color = colors.SurfaceVariant
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = "+",
                fontSize = 22.sp,
                fontWeight = FontWeight.Light,
                color = colors.TextPrimary
            )
        }
    }
}

/**
 * 文本输入框 - Manus 1.6 Lite 风格
 */
@Composable
private fun InputField(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    enabled: Boolean,
    colors: com.example.claw_code_application.ui.theme.AppColors,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        color = colors.SurfaceVariant
    ) {
        TextField(
            value = text,
            onValueChange = onTextChange,
            modifier = Modifier.heightIn(min = 48.dp, max = 120.dp),
            placeholder = {
                Text(
                    "向 Manus 发送消息...",
                    color = colors.TextSecondary,
                    fontSize = 15.sp
                )
            },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = colors.SurfaceVariant,
                unfocusedContainerColor = colors.SurfaceVariant,
                disabledContainerColor = colors.SurfaceVariant,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                cursorColor = colors.PrimaryLight,
                focusedTextColor = colors.TextPrimary,
                unfocusedTextColor = colors.TextPrimary,
                disabledTextColor = colors.TextSecondary
            ),
            textStyle = TextStyle(
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontFamily = FontFamily.SansSerif
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
 * 语音输入按钮 - Manus 1.6 Lite 风格
 * 简洁的麦克风图标，录音时有轻微脉冲动画
 */
@Composable
private fun VoiceInputButton(
    isListening: Boolean,
    onStartListening: () -> Unit,
    onStopListening: () -> Unit,
    colors: com.example.claw_code_application.ui.theme.AppColors
) {
    val infiniteTransition = rememberInfiniteTransition(label = "voice_pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.3f,
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
                            color = colors.PrimaryLight.copy(alpha = pulseAlpha * 0.2f),
                            shape = CircleShape
                        )
                )
                Icon(
                    imageVector = Icons.Default.Mic,
                    contentDescription = "停止录音",
                    tint = colors.PrimaryLight,
                    modifier = Modifier.size(22.dp)
                )
            }
        } else {
            Icon(
                imageVector = Icons.Default.Mic,
                contentDescription = "语音输入",
                tint = colors.TextSecondary,
                modifier = Modifier.size(22.dp)
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

/**
 * 技能芯片行 - 在输入框上方展示已选技能
 * 横向可滚动，每个芯片包含闪电图标+名称+关闭按钮
 */
@Composable
private fun SkillChipsRow(
    skills: List<com.example.claw_code_application.ui.chat.SkillAttachment>,
    onRemove: (com.example.claw_code_application.ui.chat.SkillAttachment) -> Unit,
    colors: com.example.claw_code_application.ui.theme.AppColors
) {
    androidx.compose.foundation.lazy.LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(
            count = skills.size,
            key = { index -> skills[index].id }
        ) { index ->
            val skill = skills[index]
            androidx.compose.material3.Surface(
                shape = RoundedCornerShape(16.dp),
                color = colors.PrimaryLight.copy(alpha = 0.15f),
                border = androidx.compose.foundation.BorderStroke(1.dp, colors.PrimaryLight.copy(alpha = 0.3f))
            ) {
                Row(
                    modifier = Modifier
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "⚡",
                        fontSize = 12.sp
                    )
                    Text(
                        text = skill.name,
                        fontSize = 12.sp,
                        color = colors.PrimaryLight,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1
                    )
                    androidx.compose.material3.IconButton(
                        onClick = { onRemove(skill) },
                        modifier = Modifier.size(16.dp)
                    ) {
                        Text(
                            text = "×",
                            fontSize = 14.sp,
                            color = colors.TextSecondary
                        )
                    }
                }
            }
        }
    }
}
