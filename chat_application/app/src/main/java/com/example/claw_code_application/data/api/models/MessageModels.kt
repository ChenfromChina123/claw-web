package com.example.claw_code_application.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * 聊天消息
 */
data class Message(
    val id: String,
    val role: String,  // "user" | "assistant"
    val content: String,
    @SerializedName("timestamp")
    val timestamp: String,
    @SerializedName("toolCalls")
    val toolCalls: List<ToolCall>? = null,
    /**
     * 是否正在流式输出（UI状态，非API字段）
     */
    val isStreaming: Boolean = false
)
