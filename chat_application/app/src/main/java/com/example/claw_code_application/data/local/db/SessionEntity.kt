package com.example.claw_code_application.data.local.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * 会话数据库实体
 * 用于本地缓存会话列表
 */
@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey
    val id: String,
    val title: String,
    val model: String,
    val userId: String?,
    val isPinned: Boolean,
    val createdAt: String,
    val updatedAt: String,
    val lastMessage: String? = null,
    val isRunning: Boolean = false,
    val lastAccessedAt: Long = System.currentTimeMillis(),
    val cachedAt: Long = System.currentTimeMillis()
)
