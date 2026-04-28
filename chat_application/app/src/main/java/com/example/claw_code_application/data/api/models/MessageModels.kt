package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Immutable
@Serializable
data class Message(
    val id: String,
    val role: String,
    val content: String,
    @SerialName("createdAt")
    val timestamp: String,
    @SerialName("toolCalls")
    val toolCalls: List<ToolCall>? = null,
    val isStreaming: Boolean = false,
    val attachments: List<ImageAttachment>? = null
)

@Immutable
@Serializable
data class ImageAttachment(
    val imageId: String,
    val type: String = "image",
    val mimeType: String? = null
)

@Immutable
@Serializable
data class ImageUploadResult(
    val imageId: String,
    val url: String,
    val originalName: String? = null
)