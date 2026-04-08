package com.aispring.service.impl;

import com.aispring.entity.AgentToolCall;
import com.aispring.repository.AgentToolCallRepository;
import com.aispring.service.AgentToolCallService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Agent 工具调用服务实现类
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AgentToolCallServiceImpl implements AgentToolCallService {

    private final AgentToolCallRepository toolCallRepository;

    @Override
    @Transactional
    public AgentToolCall createToolCall(Long taskId, String toolName, String toolInput, int stepNumber, String thought) {
        log.info("Creating tool call for task: {}, tool: {}", taskId, toolName);

        AgentToolCall toolCall = new AgentToolCall();
        toolCall.setTaskId(taskId);
        toolCall.setToolName(toolName);
        toolCall.setToolInput(toolInput);
        toolCall.setStepNumber(stepNumber);
        toolCall.setThought(thought);
        toolCall.setStatus("pending");

        return toolCallRepository.save(toolCall);
    }

    @Override
    @Transactional
    public void startToolCall(Long toolCallId) {
        toolCallRepository.findById(toolCallId).ifPresent(toolCall -> {
            toolCall.start();
            toolCallRepository.save(toolCall);
        });
    }

    @Override
    @Transactional
    public void succeedToolCall(Long toolCallId, String output, String observation) {
        log.info("Tool call succeeded: {}", toolCallId);

        toolCallRepository.findById(toolCallId).ifPresent(toolCall -> {
            toolCall.succeed(output);
            toolCall.setObservation(observation);
            toolCallRepository.save(toolCall);
        });
    }

    @Override
    @Transactional
    public void failToolCall(Long toolCallId, String errorMessage) {
        log.error("Tool call failed: {}, error: {}", toolCallId, errorMessage);

        toolCallRepository.findById(toolCallId).ifPresent(toolCall -> {
            toolCall.fail(errorMessage);
            toolCallRepository.save(toolCall);
        });
    }

    @Override
    public List<AgentToolCall> getToolCallsByTaskId(Long taskId) {
        return toolCallRepository.findByTaskIdOrderByCreatedAtAsc(taskId);
    }

    @Override
    public List<AgentToolCall> getToolCallsByTaskIdAndName(Long taskId, String toolName) {
        return toolCallRepository.findByTaskIdAndToolName(taskId, toolName);
    }

    @Override
    public AgentToolCall getLatestToolCall(Long taskId) {
        return toolCallRepository.findLatestByTaskId(taskId);
    }

    @Override
    public Long getTotalDuration(Long taskId) {
        Long duration = toolCallRepository.sumDurationByTaskId(taskId);
        return duration != null ? duration : 0L;
    }

    @Override
    public long countToolCalls(Long taskId) {
        return toolCallRepository.countByTaskId(taskId);
    }
}
