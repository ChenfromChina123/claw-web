package com.aispring.repository;

import com.aispring.entity.AgentTask;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Agent 任务 Repository 接口
 */
@Repository
public interface AgentTaskRepository extends JpaRepository<AgentTask, Long> {

    /**
     * 根据会话ID查找任务列表
     */
    List<AgentTask> findBySessionIdOrderByCreatedAtDesc(Long sessionId);

    /**
     * 根据会话ID分页查找任务列表
     */
    Page<AgentTask> findBySessionId(Long sessionId, Pageable pageable);

    /**
     * 根据用户ID查找任务列表
     */
    List<AgentTask> findByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * 根据用户ID分页查找任务列表
     */
    Page<AgentTask> findByUserId(Long userId, Pageable pageable);

    /**
     * 根据会话ID和状态查找任务
     */
    List<AgentTask> findBySessionIdAndStatus(Long sessionId, String status);

    /**
     * 根据用户ID和任务ID查找任务
     */
    Optional<AgentTask> findByIdAndUserId(Long id, Long userId);

    /**
     * 根据会话ID和任务ID查找任务
     */
    Optional<AgentTask> findByIdAndSessionId(Long id, Long sessionId);

    /**
     * 统计会话的任务数量
     */
    long countBySessionId(Long sessionId);

    /**
     * 统计会话的特定状态任务数量
     */
    long countBySessionIdAndStatus(Long sessionId, String status);

    /**
     * 查找会话中正在运行的任务
     */
    @Query("SELECT t FROM AgentTask t WHERE t.sessionId = :sessionId AND t.status = 'running'")
    List<AgentTask> findRunningTasksBySessionId(@Param("sessionId") Long sessionId);

    /**
     * 查找用户正在运行的任务
     */
    @Query("SELECT t FROM AgentTask t WHERE t.userId = :userId AND t.status = 'running'")
    List<AgentTask> findRunningTasksByUserId(@Param("userId") Long userId);

    /**
     * 统计用户的任务数量
     */
    long countByUserId(Long userId);

    /**
     * 统计用户的特定状态任务数量
     */
    long countByUserIdAndStatus(Long userId, String status);
}
