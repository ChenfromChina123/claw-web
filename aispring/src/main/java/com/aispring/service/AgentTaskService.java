package com.aispring.service;

import com.aispring.entity.AgentTask;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Optional;

/**
 * Agent 任务服务接口
 */
public interface AgentTaskService {

    /**
     * 创建任务
     * @param sessionId 会话ID
     * @param userId 用户ID
     * @param taskType 任务类型
     * @param input 输入内容
     * @return 创建的任务
     */
    AgentTask createTask(Long sessionId, Long userId, String taskType, String input);

    /**
     * 获取任务详情
     * @param taskId 任务ID
     * @param userId 用户ID
     * @return 任务详情
     */
    Optional<AgentTask> getTaskById(Long taskId, Long userId);

    /**
     * 获取会话的任务列表
     * @param sessionId 会话ID
     * @return 任务列表
     */
    List<AgentTask> getTasksBySessionId(Long sessionId);

    /**
     * 分页获取会话的任务列表
     * @param sessionId 会话ID
     * @param pageable 分页参数
     * @return 任务分页
     */
    Page<AgentTask> getTasksBySessionId(Long sessionId, Pageable pageable);

    /**
     * 获取用户的任务列表
     * @param userId 用户ID
     * @param pageable 分页参数
     * @return 任务分页
     */
    Page<AgentTask> getTasksByUserId(Long userId, Pageable pageable);

    /**
     * 启动任务
     * @param taskId 任务ID
     * @param userId 用户ID
     * @return SSE 发射器（流式响应）
     */
    SseEmitter startTask(Long taskId, Long userId);

    /**
     * 取消任务
     * @param taskId 任务ID
     * @param userId 用户ID
     */
    void cancelTask(Long taskId, Long userId);

    /**
     * 获取正在运行的任务
     * @param sessionId 会话ID
     * @return 正在运行的任务列表
     */
    List<AgentTask> getRunningTasks(Long sessionId);

    /**
     * 更新任务进度
     * @param taskId 任务ID
     * @param currentStep 当前步骤
     * @param totalSteps 总步骤数
     */
    void updateTaskProgress(Long taskId, int currentStep, int totalSteps);

    /**
     * 完成任务
     * @param taskId 任务ID
     * @param output 输出内容
     * @param tokensUsed 使用的 Token 数量
     */
    void completeTask(Long taskId, String output, long tokensUsed);

    /**
     * 任务失败
     * @param taskId 任务ID
     * @param errorMessage 错误信息
     */
    void failTask(Long taskId, String errorMessage);
}
