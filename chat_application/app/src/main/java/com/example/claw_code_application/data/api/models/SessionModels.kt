package com.example.claw_code_application.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * 会话信息
 */
data class Session(
    val id: String,
    val title: String,
    val model: String = "qwen-plus",
    @SerializedName("createdAt")
    val createdAt: String,
    @SerializedName("updatedAt")
    val updatedAt: String,
    @SerializedName("isPinned")
    val isPinned: Boolean = false
)

/**
 * 创建新会话的请求体
 */
data class CreateSessionRequest(
    val title: String? = null,
    val model: String = "qwen-plus"
)

/**
 * 会话详情（包含消息和工具调用历史）
 */
data class SessionDetail(
    val session: Session,
    val messages: List<Message>,
    val toolCalls: List<ToolCall>
)
