package com.example.claw_code_application.data.local.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 工具调用数据库实体
 * 用于本地缓存工具调用历史
 */
@Entity(
    tableName = "tool_calls",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["sessionId"]), Index(value = ["messageId"])]
)
data class ToolCallEntity(
    @PrimaryKey
    val id: String,
    val sessionId: String,
    val messageId: String?,
    val toolName: String,
    val toolInputJson: String,
    val toolOutputJson: String?,
    val status: String,
    val error: String?,
    val createdAt: String,
    val completedAt: String?,
    val cachedAt: Long = System.currentTimeMillis()
)
