package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.JsonObject

@Immutable
data class ToolCall(
    val id: String,
    @SerialName("messageId")
    val messageId: String? = null,
    @SerialName("sessionId")
    val sessionId: String? = null,
    @SerialName("toolName")
    val toolName: String,
    @SerialName("toolInput")
    val toolInput: JsonObject,
    @SerialName("toolOutput")
    val toolOutput: String? = null,
    val status: String,
    val error: String? = null,
    @SerialName("createdAt")
    val createdAt: String,
    @SerialName("completedAt")
    val completedAt: String? = null
) {
    fun getInputString(key: String): String? {
        return toolInput[key]?.toString()
    }

    fun hasInputKey(key: String): Boolean {
        return key in toolInput
    }
}

data class ExecuteAgentRequest(
    @SerialName("agentId")
    val agentId: String = "default",
    @SerialName("sessionId")
    val sessionId: String,
    val task: String,
    val prompt: String,
    val tools: List<String> = emptyList(),
    @SerialName("maxTurns")
    val maxTurns: Int? = null
)

data class ExecuteAgentResponse(
    val messages: List<Message>,
    val toolCalls: List<ToolCall>,
    @SerialName("executionStatus")
    val executionStatus: ExecutionStatus
)

@Immutable
data class ExecutionStatus(
    val status: String,
    @SerialName("currentTurn")
    val currentTurn: Int,
    @SerialName("maxTurns")
    val maxTurns: Int,
    val progress: Int,
    val message: String? = null
)
