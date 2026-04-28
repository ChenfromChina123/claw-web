package com.example.claw_code_application.data.api.models

import kotlinx.serialization.SerialName

enum class BackgroundTaskStatus {
    PENDING,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED
}

data class AgentBackgroundTask(
    @SerialName("taskId")
    val taskId: String,
    @SerialName("traceId")
    val traceId: String? = null,
    val name: String,
    val status: BackgroundTaskStatus = BackgroundTaskStatus.PENDING,
    val progress: Int = 0,
    val result: String? = null,
    val error: String? = null,
    @SerialName("createdAt")
    val createdAt: Long = System.currentTimeMillis(),
    @SerialName("startedAt")
    val startedAt: Long? = null,
    @SerialName("completedAt")
    val completedAt: Long? = null
)

data class AgentTaskStepInfo(
    val id: String,
    val title: String,
    val status: StepStatus = StepStatus.PENDING,
    val description: String? = null,
    val startedAt: Long? = null,
    val completedAt: Long? = null
)

enum class StepStatus {
    PENDING,
    ACTIVE,
    COMPLETED,
    ERROR
}

data class AgentTaskMonitorState(
    val tasks: List<AgentBackgroundTask> = emptyList(),
    val activeTaskCount: Int = 0,
    val completedTaskCount: Int = 0,
    val failedTaskCount: Int = 0,
    val isExpanded: Boolean = false,
    val isMinimized: Boolean = true
)
