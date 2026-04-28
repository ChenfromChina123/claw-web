package com.example.claw_code_application.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/**
 * 会话数据访问对象
 */
@Dao
interface SessionDao {

    /**
     * 获取所有会话（按最后访问时间降序）
     */
    @Query("SELECT * FROM sessions ORDER BY lastAccessedAt DESC")
    fun getAllSessions(): Flow<List<SessionEntity>>

    /**
     * 获取所有会话（一次性）
     */
    @Query("SELECT * FROM sessions ORDER BY lastAccessedAt DESC")
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
     * 插入会话列表（批量，替换冲突）
     */
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
     * 更新最后访问时间
     */
    @Query("UPDATE sessions SET lastAccessedAt = :timestamp WHERE id = :sessionId")
    suspend fun updateLastAccessedAt(sessionId: String, timestamp: Long)

    /**
     * 删除会话
     */
    @Query("DELETE FROM sessions WHERE id = :sessionId")
    suspend fun deleteSession(sessionId: String)

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
     * 清理过期缓存（超过指定时间的缓存）
     */
    @Query("DELETE FROM sessions WHERE cachedAt < :threshold")
    suspend fun deleteOldSessions(threshold: Long)
}
