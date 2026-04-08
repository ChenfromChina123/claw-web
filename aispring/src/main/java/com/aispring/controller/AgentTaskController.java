package com.aispring.controller;

import com.aispring.controller.dto.AgentTaskCreateRequest;
import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.AgentTask;
import com.aispring.security.CustomUserDetails;
import com.aispring.service.AgentSessionService;
import com.aispring.service.AgentTaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * Agent 任务控制器
 */
@RestController
@RequestMapping("/api/agent/tasks")
@Slf4j
@RequiredArgsConstructor
public class AgentTaskController {

    private final AgentTaskService taskService;
    private final AgentSessionService sessionService;

    /**
     * 创建任务
     */
    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AgentTask>> createTask(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody AgentTaskCreateRequest request) {
        Long userId = userDetails.getUser().getId();
        log.info("Creating task for user: {}", userId);

        Long sessionId = request.getSessionId();
        if (sessionId == null) {
            sessionId = sessionService.getOrCreateActiveSession(userId).getId();
        }

        AgentTask task = taskService.createTask(
                sessionId,
                userId,
                request.getTaskType(),
                request.getInput()
        );
        return ResponseEntity.ok(ApiResponse.success(task));
    }

    /**
     * 获取任务详情
     */
    @GetMapping(value = "/{taskId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AgentTask>> getTask(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable Long taskId) {
        Long userId = userDetails.getUser().getId();
        return taskService.getTaskById(taskId, userId)
                .map(task -> ResponseEntity.ok(ApiResponse.success(task)))
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * 获取会话的任务列表
     */
    @GetMapping(value = "/session/{sessionId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<List<AgentTask>>> getTasksBySession(
            @PathVariable Long sessionId) {
        List<AgentTask> tasks = taskService.getTasksBySessionId(sessionId);
        return ResponseEntity.ok(ApiResponse.success(tasks));
    }

    /**
     * 分页获取会话的任务列表
     */
    @GetMapping(value = "/session/{sessionId}/page", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Page<AgentTask>>> getTasksBySessionPage(
            @PathVariable Long sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<AgentTask> tasks = taskService.getTasksBySessionId(sessionId, pageRequest);
        return ResponseEntity.ok(ApiResponse.success(tasks));
    }

    /**
     * 分页获取用户的任务列表
     */
    @GetMapping(value = "/user/page", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Page<AgentTask>>> getTasksByUserPage(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long userId = userDetails.getUser().getId();
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<AgentTask> tasks = taskService.getTasksByUserId(userId, pageRequest);
        return ResponseEntity.ok(ApiResponse.success(tasks));
    }

    /**
     * 启动任务（流式响应）
     */
    @GetMapping(value = "/{taskId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter startTask(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable Long taskId) {
        Long userId = userDetails.getUser().getId();
        log.info("Starting task stream for user: {}, task: {}", userId, taskId);
        return taskService.startTask(taskId, userId);
    }

    /**
     * 取消任务
     */
    @PostMapping(value = "/{taskId}/cancel", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Void>> cancelTask(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable Long taskId) {
        Long userId = userDetails.getUser().getId();
        taskService.cancelTask(taskId, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /**
     * 获取正在运行的任务
     */
    @GetMapping(value = "/running/session/{sessionId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<List<AgentTask>>> getRunningTasks(
            @PathVariable Long sessionId) {
        List<AgentTask> tasks = taskService.getRunningTasks(sessionId);
        return ResponseEntity.ok(ApiResponse.success(tasks));
    }
}
