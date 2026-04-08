package com.aispring.repository;

import com.aispring.entity.AgentToolCall;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Agent 工具调用 Repository 接口
 */
@Repository
public interface AgentToolCallRepository extends JpaRepository<AgentToolCall, Long> {

    /**
     * 根据任务ID查找工具调用列表
     */
    List<AgentToolCall> findByTaskIdOrderByCreatedAtAsc(Long taskId);

    /**
     * 根据任务ID和工具名称查找工具调用列表
     */
    List<AgentToolCall> findByTaskIdAndToolName(Long taskId, String toolName);

    /**
     * 根据任务ID和状态查找工具调用列表
     */
    List<AgentToolCall> findByTaskIdAndStatus(Long taskId, String status);

    /**
     * 统计任务的工具调用数量
     */
    long countByTaskId(Long taskId);

    /**
     * 统计任务的特定工具调用数量
     */
    long countByTaskIdAndToolName(Long taskId, String toolName);

    /**
     * 计算任务的总执行时间
     */
    @Query("SELECT SUM(t.durationMs) FROM AgentToolCall t WHERE t.taskId = :taskId AND t.status = 'success'")
    Long sumDurationByTaskId(@Param("taskId") Long taskId);

    /**
     * 查找任务的最新工具调用
     */
    @Query("SELECT t FROM AgentToolCall t WHERE t.taskId = :taskId ORDER BY t.createdAt DESC LIMIT 1")
    AgentToolCall findLatestByTaskId(@Param("taskId") Long taskId);

    /**
     * 查找任务的最后一个成功的工具调用
     */
    @Query("SELECT t FROM AgentToolCall t WHERE t.taskId = :taskId AND t.status = 'success' ORDER BY t.stepNumber DESC LIMIT 1")
    AgentToolCall findLatestSuccessByTaskId(@Param("taskId") Long taskId);

    /**
     * 删除任务的所有工具调用记录
     */
    void deleteByTaskId(Long taskId);
}
