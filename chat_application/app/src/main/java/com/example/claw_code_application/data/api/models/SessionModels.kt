package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName

@Immutable
data class Session(
    val id: String,
    val title: String,
    val model: String = "qwen-plus",
    @SerialName("userId")
    val userId: String? = null,
    @SerialName("isPinned")
    val isPinned: Boolean = false,
    @SerialName("createdAt")
    val createdAt: String,
    @SerialName("updatedAt")
    val updatedAt: String
)

data class CreateSessionRequest(
    val title: String? = null,
    val model: String = "qwen-plus"
)

data class SessionDetail(
    val session: Session,
    val messages: List<Message>,
    val toolCalls: List<ToolCall>
)
