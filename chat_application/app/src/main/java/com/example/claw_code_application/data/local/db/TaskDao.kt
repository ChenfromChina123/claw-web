package com.example.claw_code_application.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * 后台任务数据访问对象
 */
@Dao
interface TaskDao {

    /**
     * 获取指定会话的所有任务（Flow，实时监听）
     */
    @Query("SELECT * FROM background_tasks WHERE sessionId = :sessionId ORDER BY createdAt ASC")
    fun getTasksBySession(sessionId: String): Flow<List<TaskEntity>>

    /**
     * 获取指定会话的所有任务（一次性）
     */
    @Query("SELECT * FROM background_tasks WHERE sessionId = :sessionId ORDER BY createdAt ASC")
    suspend fun getTasksBySessionOnce(sessionId: String): List<TaskEntity>

    /**
     * 根据任务ID获取任务
     */
    @Query("SELECT * FROM background_tasks WHERE taskId = :taskId")
    suspend fun getTaskById(taskId: String): TaskEntity?

    /**
     * 插入或更新任务
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTask(task: TaskEntity)

    /**
     * 批量插入任务
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTasks(tasks: List<TaskEntity>)

    /**
     * 更新任务状态
     */
    @Query("UPDATE background_tasks SET status = :status, completedAt = :completedAt WHERE taskId = :taskId")
    suspend fun updateTaskStatus(taskId: String, status: String, completedAt: Long?)

    /**
     * 更新任务进度
     */
    @Query("UPDATE background_tasks SET progress = :progress WHERE taskId = :taskId")
    suspend fun updateTaskProgress(taskId: String, progress: Int)

    /**
     * 删除指定会话的所有任务
     */
    @Query("DELETE FROM background_tasks WHERE sessionId = :sessionId")
    suspend fun deleteTasksBySession(sessionId: String)

    /**
     * 清理过期缓存（7天前）
     */
    @Query("DELETE FROM background_tasks WHERE cachedAt < :threshold")
    suspend fun deleteOldTasks(threshold: Long)
}
