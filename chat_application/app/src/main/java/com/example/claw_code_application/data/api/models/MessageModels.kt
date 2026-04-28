package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import com.google.gson.annotations.SerializedName

/**
 * 聊天消息
 */
@Immutable
data class Message(
    val id: String,
    val role: String,
    val content: String,
    @SerializedName("createdAt")
    val timestamp: String,
    @SerializedName("toolCalls")
    val toolCalls: List<ToolCall>? = null,
    val isStreaming: Boolean = false,
    val attachments: List<ImageAttachment>? = null
)

/**
 * 图片附件
 */
@Immutable
data class ImageAttachment(
    val imageId: String,
    val type: String = "image",
    val mimeType: String? = null
)

/**
 * 图片上传结果
 */
@Immutable
data class ImageUploadResult(
    val imageId: String,
    val url: String,
    val originalName: String? = null
)
