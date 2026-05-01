package com.example.claw_code_application.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/**
 * 会话数据访问对象（优化版）
 *
 * 微信架构思想：
 * 1. 分页加载 - 避免一次性加载大量会话
 * 2. 批量操作 - 减少数据库事务开销
 * 3. 索引优化 - 利用复合索引提升查询性能
 * 4. 置顶优先 - 置顶会话始终排在最前面
 */
@Dao
interface SessionDao {

    /**
     * 获取所有会话（按置顶状态和最后访问时间排序）
     * 置顶会话优先，然后按最后访问时间降序
     */
    @Query("""
        SELECT * FROM sessions 
        ORDER BY isPinned DESC, lastAccessedAt DESC
    """)
    fun getAllSessions(): Flow<List<SessionEntity>>

    /**
     * 分页获取会话列表
     *
     * @param limit 每页数量
     * @param offset 偏移量
     */
    @Query("""
        SELECT * FROM sessions 
        ORDER BY isPinned DESC, lastAccessedAt DESC
        LIMIT :limit OFFSET :offset
    """)
    suspend fun getSessionsPaged(limit: Int, offset: Int): List<SessionEntity>

    /**
     * 获取所有会话（一次性）
     * 注意：大数据量时请使用分页版本
     */
    @Query("""
        SELECT * FROM sessions 
        ORDER BY isPinned DESC, lastAccessedAt DESC
    """)
    suspend fun getAllSessionsOnce(): List<SessionEntity>

    /**
     * 根据ID获取会话
     */
    @Query("SELECT * FROM sessions WHERE id = :sessionId")
    suspend fun getSessionById(sessionId: String): SessionEntity?

    /**
     * 根据ID获取会话（Flow版本）
     */
    @Query("SELECT * FROM sessions WHERE id = :sessionId")
    fun getSessionByIdFlow(sessionId: String): Flow<SessionEntity?>

    /**
     * 批量插入会话列表（事务包装，高性能）
     *
     * 微信架构思想：批量写入减少事务开销
     *
     * @param sessions 会话列表
     */
    @Transaction
    suspend fun insertSessionsBatch(sessions: List<SessionEntity>) {
        // 分批插入，每批100条
        val batchSize = 100
        sessions.chunked(batchSize).forEach { batch ->
            insertSessionsInternal(batch)
        }
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSessionsInternal(sessions: List<SessionEntity>)

    /**
     * 插入会话列表（批量，替换冲突）
     * 已废弃：请使用 insertSessionsBatch 获得更好性能
     */
    @Deprecated("使用 insertSessionsBatch 获得更好性能", ReplaceWith("insertSessionsBatch(sessions)"))
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSessions(sessions: List<SessionEntity>)

    /**
     * 插入单个会话
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(session: SessionEntity)

    /**
     * 更新会话
     */
    @Update
    suspend fun updateSession(session: SessionEntity)

    /**
     * 批量更新会话（事务包装）
     */
    @Transaction
    suspend fun updateSessionsBatch(sessions: List<SessionEntity>) {
        sessions.forEach { updateSession(it) }
    }

    /**
     * 更新最后访问时间
     */
    @Query("UPDATE sessions SET lastAccessedAt = :timestamp WHERE id = :sessionId")
    suspend fun updateLastAccessedAt(sessionId: String, timestamp: Long)

    /**
     * 更新会话置顶状态
     */
    @Query("UPDATE sessions SET isPinned = :isPinned WHERE id = :sessionId")
    suspend fun updatePinStatus(sessionId: String, isPinned: Boolean)

    /**
     * 更新会话标题
     */
    @Query("UPDATE sessions SET title = :title, updatedAt = :updatedAt WHERE id = :sessionId")
    suspend fun updateTitle(sessionId: String, title: String, updatedAt: String)

    /**
     * 更新最后一条消息
     */
    @Query("UPDATE sessions SET lastMessage = :lastMessage, updatedAt = :updatedAt WHERE id = :sessionId")
    suspend fun updateLastMessage(sessionId: String, lastMessage: String, updatedAt: String)

    /**
     * 删除会话
     */
    @Query("DELETE FROM sessions WHERE id = :sessionId")
    suspend fun deleteSession(sessionId: String)

    /**
     * 批量删除会话（事务包装）
     */
    @Transaction
    suspend fun deleteSessionsBatch(sessionIds: List<String>) {
        sessionIds.forEach { deleteSession(it) }
    }

    /**
     * 删除所有会话
     */
    @Query("DELETE FROM sessions")
    suspend fun deleteAllSessions()

    /**
     * 获取会话数量
     */
    @Query("SELECT COUNT(*) FROM sessions")
    suspend fun getSessionCount(): Int

    /**
     * 获取置顶会话数量
     */
    @Query("SELECT COUNT(*) FROM sessions WHERE isPinned = 1")
    suspend fun getPinnedSessionCount(): Int

    /**
     * 搜索会话标题
     *
     * @param keyword 搜索关键词
     */
    @Query("""
        SELECT * FROM sessions 
        WHERE title LIKE '%' || :keyword || '%'
        ORDER BY isPinned DESC, lastAccessedAt DESC
        LIMIT 50
    """)
    suspend fun searchSessions(keyword: String): List<SessionEntity>

    /**
     * 获取指定用户的所有会话
     *
     * @param userId 用户ID
     */
    @Query("""
        SELECT * FROM sessions 
        WHERE userId = :userId
        ORDER BY isPinned DESC, lastAccessedAt DESC
    """)
    suspend fun getSessionsByUser(userId: String): List<SessionEntity>

    /**
     * 清理过期缓存（利用cachedAt索引，高效删除）
     */
    @Query("DELETE FROM sessions WHERE cachedAt < :threshold")
    suspend fun deleteOldSessions(threshold: Long)

    /**
     * 获取最近更新的会话（用于增量同步）
     *
     * @param since 时间戳，获取此时间之后更新的会话
     */
    @Query("""
        SELECT * FROM sessions 
        WHERE updatedAt > :since
        ORDER BY updatedAt DESC
    """)
    suspend fun getRecentlyUpdatedSessions(since: String): List<SessionEntity>

    /**
     * 批量获取会话的消息数量
     * 避免 N+1 查询问题，一次性返回所有会话的消息计数
     * 
     * @return Map<sessionId, messageCount>
     */
    @Query("""
        SELECT s.id as sessionId, COUNT(m.id) as messageCount 
        FROM sessions s 
        LEFT JOIN messages m ON s.id = m.sessionId 
        GROUP BY s.id
    """)
    suspend fun getSessionMessageCounts(): List<SessionMessageCount>

    /**
     * 检查是否存在没有消息的会话
     * 用于快速判断是否需要全量同步
     * 
     * @return 是否存在消息数为 0 的会话
     */
    @Query("""
        SELECT EXISTS(
            SELECT 1 FROM sessions s 
            LEFT JOIN messages m ON s.id = m.sessionId 
            GROUP BY s.id 
            HAVING COUNT(m.id) = 0
            LIMIT 1
        )
    """)
    suspend fun hasSessionsWithoutMessages(): Boolean
}

/**
 * 会话消息计数数据类
 * 用于批量查询结果
 */
data class SessionMessageCount(
    val sessionId: String,
    val messageCount: Int
)
