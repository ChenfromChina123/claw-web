package com.example.claw_code_application.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * 工具调用数据访问对象
 */
@Dao
interface ToolCallDao {

    /**
     * 获取指定会话的所有工具调用
     */
    @Query("SELECT * FROM tool_calls WHERE sessionId = :sessionId ORDER BY createdAt ASC")
    fun getToolCallsBySession(sessionId: String): Flow<List<ToolCallEntity>>

    /**
     * 获取指定会话的所有工具调用（一次性）
     */
    @Query("SELECT * FROM tool_calls WHERE sessionId = :sessionId ORDER BY createdAt ASC")
    suspend fun getToolCallsBySessionOnce(sessionId: String): List<ToolCallEntity>

    /**
     * 获取指定消息的所有工具调用
     */
    @Query("SELECT * FROM tool_calls WHERE messageId = :messageId ORDER BY createdAt ASC")
    fun getToolCallsByMessage(messageId: String): Flow<List<ToolCallEntity>>

    /**
     * 获取指定消息的所有工具调用（一次性）
     */
    @Query("SELECT * FROM tool_calls WHERE messageId = :messageId ORDER BY createdAt ASC")
    suspend fun getToolCallsByMessageOnce(messageId: String): List<ToolCallEntity>

    /**
     * 根据ID获取工具调用
     */
    @Query("SELECT * FROM tool_calls WHERE id = :toolCallId")
    suspend fun getToolCallById(toolCallId: String): ToolCallEntity?

    /**
     * 插入工具调用列表（批量，替换冲突）
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertToolCalls(toolCalls: List<ToolCallEntity>)

    /**
     * 插入单个工具调用
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertToolCall(toolCall: ToolCallEntity)

    /**
     * 更新工具调用状态
     */
    @Query("UPDATE tool_calls SET status = :status, completedAt = :completedAt WHERE id = :toolCallId")
    suspend fun updateToolCallStatus(
        toolCallId: String,
        status: String,
        completedAt: String?
    )

    /**
     * 删除指定会话的所有工具调用
     */
    @Query("DELETE FROM tool_calls WHERE sessionId = :sessionId")
    suspend fun deleteToolCallsBySession(sessionId: String)

    /**
     * 删除指定消息的所有工具调用
     */
    @Query("DELETE FROM tool_calls WHERE messageId = :messageId")
    suspend fun deleteToolCallsByMessage(messageId: String)

    /**
     * 获取指定会话的工具调用数量
     */
    @Query("SELECT COUNT(*) FROM tool_calls WHERE sessionId = :sessionId")
    suspend fun getToolCallCount(sessionId: String): Int

    /**
     * 清理过期缓存
     */
    @Query("DELETE FROM tool_calls WHERE cachedAt < :threshold")
    suspend fun deleteOldToolCalls(threshold: Long)

    /**
     * 清理指定会话的过期工具调用
     */
    @Query("DELETE FROM tool_calls WHERE sessionId = :sessionId AND cachedAt < :threshold")
    suspend fun deleteOldToolCallsInSession(sessionId: String, threshold: Long)
}
