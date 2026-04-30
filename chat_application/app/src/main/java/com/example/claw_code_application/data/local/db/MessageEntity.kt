package com.example.claw_code_application.data.local.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 消息数据库实体（优化版）
 * 用于本地缓存会话消息历史
 *
 * 微信架构思想：数据库优化 - 添加高频查询索引，提升查询性能
 *
 * 索引设计：
 * - sessionId + timestamp: 会话消息时间范围查询（最常用）
 * - timestamp: 时间排序查询
 * - id: 主键索引（自动创建）
 */
@Entity(
    tableName = "messages",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        // 复合索引：会话ID+时间戳，优化会话消息查询和排序
        Index(value = ["sessionId", "timestamp"]),
        // 单列索引：时间戳，优化时间范围查询
        Index(value = ["timestamp"]),
        // 单列索引：cachedAt，优化缓存清理
        Index(value = ["cachedAt"])
    ]
)
data class MessageEntity(
    @PrimaryKey
    val id: String,
    val sessionId: String,
    val role: String,
    val content: String,
    val timestamp: String,
    val isStreaming: Boolean,
    val attachmentsJson: String? = null,
    val cachedAt: Long = System.currentTimeMillis()
)
