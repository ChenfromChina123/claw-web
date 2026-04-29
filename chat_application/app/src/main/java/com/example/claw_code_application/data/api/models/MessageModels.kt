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
    @SerialName("timestamp")
    val timestamp: String = "",
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

/**
 * 文件上传结果
 */
@Immutable
@Serializable
data class FileUploadResult(
    val success: Boolean,
    val uploaded: List<UploadedFileInfo>,
    val failed: List<FailedFileInfo>,
    val total: Int,
    val message: String
)

/**
 * 上传成功的文件信息
 */
@Immutable
@Serializable
data class UploadedFileInfo(
    val path: String,
    val name: String,
    val size: Long
)

/**
 * 上传失败的文件信息
 */
@Immutable
@Serializable
data class FailedFileInfo(
    val name: String,
    val reason: String
)