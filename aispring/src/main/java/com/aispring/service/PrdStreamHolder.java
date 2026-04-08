package com.aispring.service;

import com.aispring.dto.PrdStateDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * PRD 流程 SSE 连接与状态推送持有者
 * 维护 runId -> SseEmitter 与 runId -> 最新状态，供 Pipeline 推送与前端订阅
 */
@Component
@Slf4j
public class PrdStreamHolder {

    private static final long SSE_TIMEOUT_MS = 300_000L;

    private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final Map<String, PrdStateDto> latestState = new ConcurrentHashMap<>();

    /**
     * 注册该 runId 的 SSE 连接（前端 GET /prd/stream/{runId} 时调用）
     */
    public SseEmitter register(String runId) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitter.onCompletion(() -> emitters.remove(runId));
        emitter.onTimeout(() -> emitters.remove(runId));
        emitter.onError(e -> emitters.remove(runId));
        emitters.put(runId, emitter);
        PrdStateDto state = latestState.get(runId);
        if (state != null) {
            try {
                emitter.send(SseEmitter.event().name("message").data(state));
            } catch (IOException ex) {
                log.warn("Send initial state to runId {} failed: {}", runId, ex.getMessage());
            }
        }
        return emitter;
    }

    /**
     * Pipeline 每步完成后推送状态
     */
    public void send(String runId, PrdStateDto state) {
        latestState.put(runId, state);
        SseEmitter emitter = emitters.get(runId);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event().name("message").data(state));
            } catch (IOException e) {
                log.warn("Send PRD state to runId {} failed: {}", runId, e.getMessage());
                emitters.remove(runId);
            }
        }
    }

    /**
     * 流程结束或异常时完成并清理
     */
    public void complete(String runId) {
        SseEmitter emitter = emitters.remove(runId);
        if (emitter != null) {
            try {
                emitter.complete();
            } catch (Exception e) {
                log.debug("Complete emitter for runId {}: {}", runId, e.getMessage());
            }
        }
        latestState.remove(runId);
    }

    public PrdStateDto getLatestState(String runId) {
        return latestState.get(runId);
    }
}
