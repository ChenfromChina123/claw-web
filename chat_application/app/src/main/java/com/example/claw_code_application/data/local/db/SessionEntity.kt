package com.example.claw_code_application.data.local.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 会话数据库实体（优化版）
 * 用于本地缓存会话列表
 *
 * 微信架构思想：数据库优化 - 添加高频查询索引，提升查询性能
 *
 * 索引设计：
 * - lastAccessedAt: 最后访问时间排序（会话列表默认排序）
 * - isPinned + lastAccessedAt: 置顶会话排序
 * - userId: 按用户查询会话
 * - updatedAt: 更新时间排序
 */
@Entity(
    tableName = "sessions",
    indices = [
        // 单列索引：最后访问时间，优化会话列表查询
        Index(value = ["lastAccessedAt"]),
        // 复合索引：置顶状态+最后访问时间，优化置顶会话排序
        Index(value = ["isPinned", "lastAccessedAt"]),
        // 单列索引：用户ID，优化按用户查询
        Index(value = ["userId"]),
        // 单列索引：更新时间，优化同步查询
        Index(value = ["updatedAt"]),
        // 单列索引：cachedAt，优化缓存清理
        Index(value = ["cachedAt"])
    ]
)
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
