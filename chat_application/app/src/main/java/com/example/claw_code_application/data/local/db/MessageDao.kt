package com.example.claw_code_application.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * 消息数据访问对象
 */
@Dao
interface MessageDao {

    /**
     * 获取指定会话的所有消息（按时间升序）
     */
    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY timestamp ASC")
    fun getMessagesBySession(sessionId: String): Flow<List<MessageEntity>>

    /**
     * 获取指定会话的所有消息（一次性）
     */
    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY timestamp ASC")
    suspend fun getMessagesBySessionOnce(sessionId: String): List<MessageEntity>

    /**
     * 根据ID获取消息
     */
    @Query("SELECT * FROM messages WHERE id = :messageId")
    suspend fun getMessageById(messageId: String): MessageEntity?

    /**
     * 插入消息列表（批量，替换冲突）
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<MessageEntity>)

    /**
     * 插入单条消息
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: MessageEntity)

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
     * 获取指定会话的消息数量
     */
    @Query("SELECT COUNT(*) FROM messages WHERE sessionId = :sessionId")
    suspend fun getMessageCount(sessionId: String): Int

    /**
     * 清理过期缓存
     */
    @Query("DELETE FROM messages WHERE cachedAt < :threshold")
    suspend fun deleteOldMessages(threshold: Long)

    /**
     * 清理指定会话的过期消息
     */
    @Query("DELETE FROM messages WHERE sessionId = :sessionId AND cachedAt < :threshold")
    suspend fun deleteOldMessagesInSession(sessionId: String, threshold: Long)
}
