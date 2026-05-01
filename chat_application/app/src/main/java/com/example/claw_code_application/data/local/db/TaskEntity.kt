package com.example.claw_code_application.data.local.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.example.claw_code_application.data.api.models.BackgroundTask

/**
 * 后台任务数据库实体
 * 用于本地持久化任务状态，确保应用重启后任务仍可显示
 */
@Entity(
    tableName = "background_tasks",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["sessionId"]),
        Index(value = ["status"]),
        Index(value = ["cachedAt"])  // 优化：支持按时间清理缓存
    ]
)
data class TaskEntity(
    @PrimaryKey
    val taskId: String,
    val sessionId: String,
    val taskName: String,
    val description: String = "",
    val status: String,
    val priority: String = "normal",
    val progress: Int = 0,
    val result: String? = null,
    val error: String? = null,
    val parentTaskId: String? = null,
    val agentId: String? = null,
    val createdAt: Long = 0L,
    val startedAt: Long? = null,
    val completedAt: Long? = null,
    val cachedAt: Long = System.currentTimeMillis()
)

/**
 * 将 TaskEntity 转换为 BackgroundTask 业务模型
 */
fun TaskEntity.toBackgroundTask(): BackgroundTask = BackgroundTask(
    taskId = taskId,
    taskName = taskName,
    description = description,
    status = status,
    priority = priority,
    progress = progress,
    result = result,
    error = error,
    parentTaskId = parentTaskId,
    agentId = agentId,
    createdAt = createdAt,
    startedAt = startedAt,
    completedAt = completedAt
)

/**
 * 将 BackgroundTask 业务模型转换为 TaskEntity
 */
fun BackgroundTask.toTaskEntity(sessionId: String): TaskEntity = TaskEntity(
    taskId = taskId,
    sessionId = sessionId,
    taskName = taskName,
    description = description,
    status = status,
    priority = priority,
    progress = progress,
    result = result,
    error = error,
    parentTaskId = parentTaskId,
    agentId = agentId,
    createdAt = createdAt,
    startedAt = startedAt,
    completedAt = completedAt
)
