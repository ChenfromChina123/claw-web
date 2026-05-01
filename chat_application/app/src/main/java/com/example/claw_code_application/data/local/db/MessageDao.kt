package com.example.claw_code_application.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

/**
 * 消息数据访问对象（优化版）
 *
 * 微信架构思想：
 * 1. 分页加载 - 避免一次性加载大量消息
 * 2. 批量操作 - 减少数据库事务开销
 * 3. 索引优化 - 利用复合索引提升查询性能
 */
@Dao
interface MessageDao {

    /**
     * 获取指定会话的所有消息（按时间升序）
     * 注意：大数据量时请使用分页版本 getMessagesBySessionPaged
     */
    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY timestamp ASC")
    fun getMessagesBySession(sessionId: String): Flow<List<MessageEntity>>

    /**
     * 分页获取指定会话的消息（按时间降序，用于倒序列表）
     *
     * @param sessionId 会话ID
     * @param limit 每页数量
     * @param offset 偏移量
     */
    @Query("""
        SELECT * FROM messages 
        WHERE sessionId = :sessionId 
        ORDER BY timestamp DESC 
        LIMIT :limit OFFSET :offset
    """)
    suspend fun getMessagesBySessionPaged(
        sessionId: String,
        limit: Int,
        offset: Int
    ): List<MessageEntity>

    /**
     * 获取指定会话的最新N条消息
     *
     * @param sessionId 会话ID
     * @param count 消息数量
     */
    @Query("""
        SELECT * FROM messages 
        WHERE sessionId = :sessionId 
        ORDER BY timestamp DESC 
        LIMIT :count
    """)
    suspend fun getLatestMessages(sessionId: String, count: Int): List<MessageEntity>

    /**
     * 获取指定时间范围内的消息
     *
     * @param sessionId 会话ID
     * @param startTime 开始时间戳
     * @param endTime 结束时间戳
     */
    @Query("""
        SELECT * FROM messages 
        WHERE sessionId = :sessionId 
        AND timestamp BETWEEN :startTime AND :endTime
        ORDER BY timestamp ASC
    """)
    suspend fun getMessagesInTimeRange(
        sessionId: String,
        startTime: String,
        endTime: String
    ): List<MessageEntity>

    /**
     * 加载早于指定时间戳的消息（用于向上翻页加载历史）
     *
     * @param sessionId 会话ID
     * @param beforeTimestamp 时间戳边界（不包含）
     * @param limit 加载数量
     */
    @Query("""
        SELECT * FROM messages 
        WHERE sessionId = :sessionId AND timestamp < :beforeTimestamp
        ORDER BY timestamp DESC
        LIMIT :limit
    """)
    suspend fun getMessagesBeforeTimestamp(
        sessionId: String,
        beforeTimestamp: String,
        limit: Int
    ): List<MessageEntity>

    /**
     * 加载晚于指定时间戳的消息（用于向下翻页加载新消息）
     *
     * @param sessionId 会话ID
     * @param afterTimestamp 时间戳边界（不包含）
     * @param limit 加载数量
     */
    @Query("""
        SELECT * FROM messages 
        WHERE sessionId = :sessionId AND timestamp > :afterTimestamp
        ORDER BY timestamp ASC
        LIMIT :limit
    """)
    suspend fun getMessagesAfterTimestamp(
        sessionId: String,
        afterTimestamp: String,
        limit: Int
    ): List<MessageEntity>

    /**
     * 获取指定会话的所有消息（一次性）
     * 注意：大数据量时请使用分页版本
     */
    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY timestamp ASC")
    suspend fun getMessagesBySessionOnce(sessionId: String): List<MessageEntity>

    /**
     * 根据ID获取消息
     */
    @Query("SELECT * FROM messages WHERE id = :messageId")
    suspend fun getMessageById(messageId: String): MessageEntity?

    /**
     * 批量插入消息列表（事务包装，高性能）
     *
     * 微信架构思想：批量写入减少事务开销
     *
     * @param messages 消息列表
     */
    @Transaction
    suspend fun insertMessagesBatch(messages: List<MessageEntity>) {
        // 分批插入，每批500条，避免SQL参数过多
        val batchSize = 500
        messages.chunked(batchSize).forEach { batch ->
            insertMessagesInternal(batch)
        }
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessagesInternal(messages: List<MessageEntity>)

    /**
     * 插入消息列表（批量，替换冲突）
     * 已废弃：请使用 insertMessagesBatch 获得更好性能
     */
    @Deprecated("使用 insertMessagesBatch 获得更好性能", ReplaceWith("insertMessagesBatch(messages)"))
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<MessageEntity>)

    /**
     * 插入单条消息
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: MessageEntity)

    /**
     * 批量更新消息（事务包装）
     */
    @Transaction
    suspend fun updateMessagesBatch(messages: List<MessageEntity>) {
        messages.forEach { updateMessageInternal(it.id, it.content, it.isStreaming) }
    }

    @Query("UPDATE messages SET content = :content, isStreaming = :isStreaming WHERE id = :messageId")
    suspend fun updateMessageInternal(messageId: String, content: String, isStreaming: Boolean)

    /**
     * 删除指定会话的所有消息
     */
    @Query("DELETE FROM messages WHERE sessionId = :sessionId")
    suspend fun deleteMessagesBySession(sessionId: String)

    /**
     * 删除单条消息
     */
    @Query("DELETE FROM messages WHERE id = :messageId")
    suspend fun deleteMessage(messageId: String)

    /**
     * 批量删除消息（事务包装，高性能）
     */
    @Transaction
    suspend fun deleteMessagesBatch(messageIds: List<String>) {
        messageIds.forEach { deleteMessage(it) }
    }

    /**
     * 获取指定会话的消息数量
     */
    @Query("SELECT COUNT(*) FROM messages WHERE sessionId = :sessionId")
    suspend fun getMessageCount(sessionId: String): Int

    /**
     * 获取指定会话的消息数量（快速估计）
     */
    @Query("SELECT COUNT(*) FROM messages WHERE sessionId = :sessionId")
    fun getMessageCountFlow(sessionId: String): Flow<Int>

    /**
     * 搜索消息内容
     *
     * @param sessionId 会话ID
     * @param keyword 搜索关键词
     */
    @Query("""
        SELECT * FROM messages 
        WHERE sessionId = :sessionId 
        AND content LIKE '%' || :keyword || '%'
        ORDER BY timestamp DESC
        LIMIT 100
    """)
    suspend fun searchMessages(sessionId: String, keyword: String): List<MessageEntity>

    /**
     * 清理过期缓存（利用cachedAt索引，高效删除）
     */
    @Query("DELETE FROM messages WHERE cachedAt < :threshold")
    suspend fun deleteOldMessages(threshold: Long)

    /**
     * 清理指定会话的过期消息
     */
    @Query("DELETE FROM messages WHERE sessionId = :sessionId AND cachedAt < :threshold")
    suspend fun deleteOldMessagesInSession(sessionId: String, threshold: Long)

    /**
     * 获取数据库中消息总数
     */
    @Query("SELECT COUNT(*) FROM messages")
    suspend fun getTotalMessageCount(): Int

    /**
     * 清理所有消息（重置缓存）
     */
    @Query("DELETE FROM messages")
    suspend fun deleteAllMessages()
}
