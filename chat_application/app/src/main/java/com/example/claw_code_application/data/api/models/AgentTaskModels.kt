package com.example.claw_code_application.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * Agent后台任务状态枚举
 */
enum class BackgroundTaskStatus {
    PENDING,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED
}

/**
 * Agent后台任务数据模型
 * 与Web端 BackgroundTask 类型对齐
 */
data class AgentBackgroundTask(
    @SerializedName("taskId")
    val taskId: String,
    @SerializedName("traceId")
    val traceId: String? = null,
    val name: String,
    val status: BackgroundTaskStatus = BackgroundTaskStatus.PENDING,
    val progress: Int = 0,
    val result: Any? = null,
    val error: String? = null,
    @SerializedName("createdAt")
    val createdAt: Long = System.currentTimeMillis(),
    @SerializedName("startedAt")
    val startedAt: Long? = null,
    @SerializedName("completedAt")
    val completedAt: Long? = null
)

/**
 * Agent任务步骤数据模型
 * 用于展示任务执行的详细步骤
 */
data class AgentTaskStepInfo(
    val id: String,
    val title: String,
    val status: StepStatus = StepStatus.PENDING,
    val description: String? = null,
    val startedAt: Long? = null,
    val completedAt: Long? = null
)

/**
 * 任务步骤状态
 */
enum class StepStatus {
    PENDING,
    ACTIVE,
    COMPLETED,
    ERROR
}

/**
 * Agent任务监控面板的UI状态
 */
data class AgentTaskMonitorState(
    val tasks: List<AgentBackgroundTask> = emptyList(),
    val activeTaskCount: Int = 0,
    val completedTaskCount: Int = 0,
    val failedTaskCount: Int = 0,
    val isExpanded: Boolean = false,
    val isMinimized: Boolean = true
)
