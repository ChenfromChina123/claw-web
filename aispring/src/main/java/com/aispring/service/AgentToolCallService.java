package com.aispring.service;

import com.aispring.entity.AgentToolCall;

import java.util.List;

/**
 * Agent 工具调用服务接口
 */
public interface AgentToolCallService {

    /**
     * 创建工具调用记录
     * @param taskId 任务ID
     * @param toolName 工具名称
     * @param toolInput 工具输入
     * @param stepNumber 步骤编号
     * @param thought 思考内容
     * @return 创建的工具调用记录
     */
    AgentToolCall createToolCall(Long taskId, String toolName, String toolInput, int stepNumber, String thought);

    /**
     * 开始执行工具
     * @param toolCallId 工具调用ID
     */
    void startToolCall(Long toolCallId);

    /**
     * 工具执行成功
     * @param toolCallId 工具调用ID
     * @param output 输出内容
     * @param observation 观察结果
     */
    void succeedToolCall(Long toolCallId, String output, String observation);

    /**
     * 工具执行失败
     * @param toolCallId 工具调用ID
     * @param errorMessage 错误信息
     */
    void failToolCall(Long toolCallId, String errorMessage);

    /**
     * 获取任务的工具调用列表
     * @param taskId 任务ID
     * @return 工具调用列表
     */
    List<AgentToolCall> getToolCallsByTaskId(Long taskId);

    /**
     * 获取任务的特定工具调用列表
     * @param taskId 任务ID
     * @param toolName 工具名称
     * @return 工具调用列表
     */
    List<AgentToolCall> getToolCallsByTaskIdAndName(Long taskId, String toolName);

    /**
     * 获取任务的最新工具调用
     * @param taskId 任务ID
     * @return 最新工具调用
     */
    AgentToolCall getLatestToolCall(Long taskId);

    /**
     * 计算任务的总执行时间
     * @param taskId 任务ID
     * @return 总执行时间（毫秒）
     */
    Long getTotalDuration(Long taskId);

    /**
     * 统计任务的工具调用次数
     * @param taskId 任务ID
     * @return 调用次数
     */
    long countToolCalls(Long taskId);
}
