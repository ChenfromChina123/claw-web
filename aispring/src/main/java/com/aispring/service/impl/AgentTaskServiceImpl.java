package com.aispring.service.impl;

import com.aispring.entity.AgentSession;
import com.aispring.entity.AgentTask;
import com.aispring.exception.CustomException;
import com.aispring.repository.AgentSessionRepository;
import com.aispring.repository.AgentTaskRepository;
import com.aispring.service.AgentTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.io.InputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Agent 任务服务实现类
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AgentTaskServiceImpl implements AgentTaskService {

    private final AgentTaskRepository taskRepository;
    private final AgentSessionRepository sessionRepository;

    private final ConcurrentHashMap<Long, SseEmitter> taskEmitters = new ConcurrentHashMap<>();
    private final ExecutorService executorService = Executors.newCachedThreadPool();

    /**
     * agent-executor 执行层基地址
     */
    @Value("${agent-executor.base-url:http://localhost:3001}")
    private String agentExecutorBaseUrl;

    @Override
    @Transactional
    public AgentTask createTask(Long sessionId, Long userId, String taskType, String input) {
        log.info("Creating task for session: {}, user: {}, type: {}", sessionId, userId, taskType);

        AgentSession session = sessionRepository.findByIdAndUserId(sessionId, userId)
                .orElseThrow(() -> new CustomException("Session not found"));

        if (!session.isActive()) {
            throw new CustomException("Session is not active");
        }

        AgentTask task = new AgentTask();
        task.setSessionId(sessionId);
        task.setUserId(userId);
        task.setTaskType(taskType);
        task.setInput(input);
        task.setStatus("pending");
        task.setTotalSteps(0);
        task.setCurrentStep(0);
        task.setTokensUsed(0L);
        task.setExecutionTimeMs(0L);

        return taskRepository.save(task);
    }

    @Override
    public Optional<AgentTask> getTaskById(Long taskId, Long userId) {
        return taskRepository.findByIdAndUserId(taskId, userId);
    }

    @Override
    public List<AgentTask> getTasksBySessionId(Long sessionId) {
        return taskRepository.findBySessionIdOrderByCreatedAtDesc(sessionId);
    }

    @Override
    public Page<AgentTask> getTasksBySessionId(Long sessionId, Pageable pageable) {
        return taskRepository.findBySessionId(sessionId, pageable);
    }

    @Override
    public Page<AgentTask> getTasksByUserId(Long userId, Pageable pageable) {
        return taskRepository.findByUserId(userId, pageable);
    }

    @Override
    @Transactional
    public SseEmitter startTask(Long taskId, Long userId) {
        log.info("Starting task: {} for user: {}", taskId, userId);

        AgentTask task = taskRepository.findByIdAndUserId(taskId, userId)
                .orElseThrow(() -> new CustomException("Task not found"));

        if (!"pending".equals(task.getStatus())) {
            throw new CustomException("Task is not in pending status");
        }

        task.start();
        taskRepository.save(task);

        SseEmitter emitter = new SseEmitter(300000L);
        taskEmitters.put(taskId, emitter);

        emitter.onCompletion(() -> taskEmitters.remove(taskId));
        emitter.onTimeout(() -> {
            taskEmitters.remove(taskId);
            cancelTask(taskId, userId);
        });
        emitter.onError(e -> taskEmitters.remove(taskId));

        executorService.submit(() -> executeTask(task, emitter));

        return emitter;
    }

    @Override
    @Transactional
    public void cancelTask(Long taskId, Long userId) {
        log.info("Cancelling task: {} for user: {}", taskId, userId);

        AgentTask task = taskRepository.findByIdAndUserId(taskId, userId)
                .orElseThrow(() -> new CustomException("Task not found"));

        if (!task.isCompleted()) {
            task.cancel();
            taskRepository.save(task);

            SseEmitter emitter = taskEmitters.remove(taskId);
            if (emitter != null) {
                try {
                    emitter.send(SseEmitter.event()
                            .name("status")
                            .data("{\"status\":\"cancelled\"}"));
                    emitter.complete();
                } catch (IOException e) {
                    log.error("Error sending cancellation event", e);
                }
            }
        }
    }

    @Override
    public List<AgentTask> getRunningTasks(Long sessionId) {
        return taskRepository.findRunningTasksBySessionId(sessionId);
    }

    @Override
    @Transactional
    public void updateTaskProgress(Long taskId, int currentStep, int totalSteps) {
        taskRepository.findById(taskId).ifPresent(task -> {
            task.setCurrentStep(currentStep);
            task.setTotalSteps(totalSteps);
            taskRepository.save(task);

            sendProgressEvent(taskId, currentStep, totalSteps);
        });
    }

    @Override
    @Transactional
    public void completeTask(Long taskId, String output, long tokensUsed) {
        log.info("Completing task: {}", taskId);

        taskRepository.findById(taskId).ifPresent(task -> {
            task.complete(output);
            task.setTokensUsed(tokensUsed);
            taskRepository.save(task);

            SseEmitter emitter = taskEmitters.remove(taskId);
            if (emitter != null) {
                try {
                    emitter.send(SseEmitter.event()
                            .name("complete")
                            .data(output != null ? output : ""));
                    emitter.complete();
                } catch (IOException e) {
                    log.error("Error sending completion event", e);
                }
            }
        });
    }

    @Override
    @Transactional
    public void failTask(Long taskId, String errorMessage) {
        log.error("Task failed: {}, error: {}", taskId, errorMessage);

        taskRepository.findById(taskId).ifPresent(task -> {
            task.fail(errorMessage);
            taskRepository.save(task);

            SseEmitter emitter = taskEmitters.remove(taskId);
            if (emitter != null) {
                try {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data("{\"error\":\"" + errorMessage.replace("\"", "\\\"") + "\"}"));
                    emitter.completeWithError(new RuntimeException(errorMessage));
                } catch (IOException e) {
                    log.error("Error sending error event", e);
                }
            }
        });
    }

    /**
     * 执行任务（异步）
     */
    private void executeTask(AgentTask task, SseEmitter emitter) {
        try {
            // 任务执行由 agent-executor 完成，并通过 SSE 流式转发到前端
            relayAgentExecutor(task, emitter);
        } catch (Exception e) {
            log.error("Error executing task: {}", task.getId(), e);

            String errMsg = e.getMessage() != null ? e.getMessage() : "Task execution failed";
            task.fail(errMsg);
            taskRepository.save(task);

            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"error\":\"" + errMsg.replace("\"", "\\\"") + "\"}"));
            } catch (IOException ignore) {
                // ignore
            }

            emitter.completeWithError(e);
        }
    }

    /**
     * 从 agent-executor 拉取 SSE，并转发到浏览器，同时落库更新任务状态。
     * @param task 当前任务实体
     * @param emitter Spring SSE 输出通道
     */
    private void relayAgentExecutor(AgentTask task, SseEmitter emitter) throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();

        Long sessionId = task.getSessionId();
        Long taskId = task.getId();
        String input = task.getInput() != null ? task.getInput() : "";

        // 1) 创建沙箱（agent-executor 内存态需要该步骤）
        Map<String, Object> createPayload = Map.of("sessionId", sessionId);
        HttpRequest createReq = HttpRequest.newBuilder()
                .uri(URI.create(agentExecutorBaseUrl + "/sandbox/create"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(createPayload), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> createResp = client.send(createReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (createResp.statusCode() < 200 || createResp.statusCode() >= 300) {
            throw new RuntimeException("agent-executor /sandbox/create failed, status=" + createResp.statusCode()
                    + ", body=" + createResp.body());
        }

        // 2) 启动执行（SSE 流式返回）
        Map<String, Object> execPayload = Map.of(
                "taskId", taskId,
                "input", input,
                "sessionId", sessionId
        );
        HttpRequest execReq = HttpRequest.newBuilder()
                .uri(URI.create(agentExecutorBaseUrl + "/execute"))
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(execPayload), StandardCharsets.UTF_8))
                .build();

        HttpResponse<InputStream> execResp = client.send(execReq, HttpResponse.BodyHandlers.ofInputStream());
        if (execResp.statusCode() < 200 || execResp.statusCode() >= 300) {
            byte[] bytes = execResp.body().readAllBytes();
            String body = new String(bytes, StandardCharsets.UTF_8);
            throw new RuntimeException("agent-executor /execute failed, status=" + execResp.statusCode()
                    + ", body=" + body);
        }

        // 3) SSE 解析并转发
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(execResp.body(), StandardCharsets.UTF_8))) {
            String line;
            String eventName = null;
            StringBuilder dataBuilder = new StringBuilder();

            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    if (eventName != null) {
                        String rawData = dataBuilder.toString().trim();
                        handleAgentSseEvent(task, emitter, mapper, eventName, rawData);

                        if ("complete".equals(eventName) || "error".equals(eventName)) {
                            taskEmitters.remove(taskId);
                            emitter.complete();
                            return;
                        }
                    }
                    eventName = null;
                    dataBuilder.setLength(0);
                    continue;
                }

                if (line.startsWith("event:")) {
                    eventName = line.substring("event:".length()).trim();
                } else if (line.startsWith("data:")) {
                    String chunk = line.substring("data:".length()).trim();
                    if (dataBuilder.length() > 0) {
                        dataBuilder.append('\n');
                    }
                    dataBuilder.append(chunk);
                }

                // 检查取消状态：每个事件边界检查一次即可
                String curStatus = taskRepository.findById(taskId).map(AgentTask::getStatus).orElse(null);
                if ("cancelled".equals(curStatus)) {
                    emitter.complete();
                    return;
                }
            }
        }

        // 流式连接异常断开：按失败处理
        if (!"completed".equals(task.getStatus()) && !"failed".equals(task.getStatus())) {
            task.fail("agent-executor SSE 连接意外中断");
            taskRepository.save(task);
        }
        emitter.complete();
    }

    /**
     * 处理 agent-executor 的单个 SSE 事件：转发给前端并同步落库。
     */
    private void handleAgentSseEvent(
            AgentTask task,
            SseEmitter emitter,
            ObjectMapper mapper,
            String eventName,
            String rawData
    ) throws Exception {
        if ("progress".equals(eventName)) {
            JsonNode node = mapper.readTree(rawData);
            int currentStep = node.path("currentStep").asInt();
            int totalSteps = node.path("totalSteps").asInt();

            task.setCurrentStep(currentStep);
            task.setTotalSteps(totalSteps);
            taskRepository.save(task);
        } else if ("complete".equals(eventName)) {
            // agent-executor 对换行做了转义：\\n -> \n，用于数据库存储更友好
            String output = rawData.replace("\\n", "\n");
            task.complete(output);
            taskRepository.save(task);
        } else if ("error".equals(eventName)) {
            JsonNode node = mapper.readTree(rawData);
            String err = node.path("error").asText("Task execution failed");
            task.fail(err);
            taskRepository.save(task);
        }

        // tool_call / output / complete 的 data 需要做反转义，保证前端展示更正常
        String forwardData = rawData;
        // 注意：output/complete 为“纯字符串” SSE data，直接替换真实换行可能破坏 SSE 行格式
        // 因此只在前端渲染时再把 \\n 转为 \n
        if ("tool_call".equals(eventName)) {
            // tool_call 是 JSON，内部 toolOutput/observation 也做反转义
            JsonNode node = mapper.readTree(rawData);
            if (node.isObject()) {
                // 只处理常见字符串字段，避免结构变化导致解析失败
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).put(
                        "toolOutput",
                        node.path("toolOutput").asText().replace("\\n", "\n")
                );
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).put(
                        "observation",
                        node.path("observation").asText().replace("\\n", "\n")
                );
                forwardData = mapper.writeValueAsString(node);
            }
        }

        emitter.send(SseEmitter.event().name(eventName).data(forwardData));
    }

    /**
     * 发送事件
     */
    private void sendEvent(SseEmitter emitter, String name, String data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data));
        } catch (IOException e) {
            log.error("Error sending event: {}", name, e);
        }
    }

    /**
     * 发送进度事件
     */
    private void sendProgressEvent(Long taskId, int currentStep, int totalSteps) {
        SseEmitter emitter = taskEmitters.get(taskId);
        if (emitter != null) {
            sendEvent(emitter, "progress",
                    "{\"currentStep\":" + currentStep + ",\"totalSteps\":" + totalSteps + "}");
        }
    }
}
