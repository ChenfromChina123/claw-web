package com.example.claw_code_application.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * 图片附件
 */
data class ImageAttachment(
    val imageId: String,
    val type: String = "image",
    val originalName: String? = null,
    val mimeType: String? = null
)

/**
 * 图片上传结果
 */
data class ImageUploadResult(
    val imageId: String,
    val url: String,
    val originalName: String,
    val mimeType: String,
    val size: Int,
    val width: Int? = null,
    val height: Int? = null
)

/**
 * 聊天消息
 */
data class Message(
    val id: String,
    val role: String,
    val content: String,
    @SerializedName("timestamp")
    val timestamp: String,
    @SerializedName("toolCalls")
    val toolCalls: List<ToolCall>? = null,
    @SerializedName("attachments")
    val attachments: List<ImageAttachment>? = null,
    val isStreaming: Boolean = false
)
