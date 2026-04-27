package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import com.google.gson.annotations.SerializedName
import com.google.gson.internal.LinkedTreeMap

/**
 * 工具调用记录
 */
@Immutable
data class ToolCall(
    val id: String,
    @SerializedName("toolName")
    val toolName: String,           // 工具名称: "Bash", "FileWrite", "WebSearch" 等
    @SerializedName("toolInput")
    val toolInput: Map<String, Any>, // 输入参数（JSON对象）
    @SerializedName("toolOutput")
    val toolOutput: Any? = null,    // 输出结果
    val status: String,             // "pending" | "executing" | "completed" | "error"
    val error: String? = null,      // 错误信息
    @SerializedName("createdAt")
    val createdAt: String,          // 开始时间
    @SerializedName("completedAt")
    val completedAt: String? = null // 完成时间
) {
    /**
     * 获取指定键的值，如果不存在返回null
     */
    fun getInputString(key: String): String? {
        return toolInput[key]?.toString()
    }

    /**
     * 检查输入参数是否包含指定的键
     */
    fun hasInputKey(key: String): Boolean {
        return toolInput.containsKey(key)
    }
}

/**
 * 执行Agent任务的请求体
 */
data class ExecuteAgentRequest(
    @SerializedName("agentId")
    val agentId: String = "default",
    @SerializedName("sessionId")
    val sessionId: String,
    val task: String,
    val prompt: String,
    val tools: List<String> = emptyList(),
    @SerializedName("maxTurns")
    val maxTurns: Int? = null
)

/**
 * 执行Agent的响应
 */
data class ExecuteAgentResponse(
    val messages: List<Message>,
    val toolCalls: List<ToolCall>,
    @SerializedName("executionStatus")
    val executionStatus: ExecutionStatus
)

/**
 * Agent执行状态
 */
@Immutable
data class ExecutionStatus(
    val status: String,             // "idle" | "running" | "completed" | "error"
    @SerializedName("currentTurn")
    val currentTurn: Int,
    @SerializedName("maxTurns")
    val maxTurns: Int,
    val progress: Int,              // 0-100
    val message: String? = null     // 状态描述
)
