package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Immutable
@Serializable
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
    val toolOutput: JsonElement? = null,
    val status: String,
    val error: String? = null,
    @SerialName("progressOutput")
    val progressOutput: String? = null,
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

@Serializable
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

@Serializable
data class ExecuteAgentResponse(
    val messages: List<Message>,
    val toolCalls: List<ToolCall>,
    @SerialName("executionStatus")
    val executionStatus: ExecutionStatus
)

@Immutable
@Serializable
data class ExecutionStatus(
    val status: String,
    @SerialName("currentTurn")
    val currentTurn: Int,
    @SerialName("maxTurns")
    val maxTurns: Int,
    val progress: Int,
    val message: String? = null
)

@Immutable
@Serializable
data class BackgroundTask(
    val taskId: String,
    @SerialName("taskName")
    val taskName: String,
    val description: String = "",
    val status: String,
    val priority: String = "normal",
    val progress: Int = 0,
    val result: String? = null,
    val error: String? = null,
    @SerialName("parentTaskId")
    val parentTaskId: String? = null,
    @SerialName("agentId")
    val agentId: String? = null,
    @SerialName("createdAt")
    val createdAt: Long = 0L,
    @SerialName("startedAt")
    val startedAt: Long? = null,
    @SerialName("completedAt")
    val completedAt: Long? = null
)

@Serializable
data class TaskStatusChangePayload(
    @SerialName("taskId")
    val taskId: String,
    @SerialName("taskName")
    val taskName: String,
    @SerialName("previousStatus")
    val previousStatus: String,
    @SerialName("newStatus")
    val newStatus: String,
    val result: String? = null,
    val error: String? = null,
    @SerialName("traceId")
    val traceId: String? = null
)