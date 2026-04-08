package com.aispring.service.impl.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * SSE 聊天响应处理器
 * 负责处理 SSE 流式响应的发送和错误处理
 */
@Component
@Slf4j
public class SseChatHandler {

    private final ObjectMapper objectMapper;

    public SseChatHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 发送聊天响应
     * @param emitter SSE 发射器
     * @param content 内容
     * @param reasoningContent 推理内容
     */
    public void sendChatResponse(SseEmitter emitter, String content, String reasoningContent) {
        Map<String, String> resultMap = new HashMap<>();
        if (reasoningContent != null && !reasoningContent.isEmpty()) {
            resultMap.put("reasoning_content", reasoningContent);
        }
        if (content != null && !content.isEmpty()) {
            resultMap.put("content", content);
        }
        if (!resultMap.isEmpty()) {
            try {
                String json = objectMapper.writeValueAsString(resultMap);
                SseEmitter.SseEventBuilder event = SseEmitter.event()
                    .data(json)
                    .id(String.valueOf(System.currentTimeMillis()))
                    .name("message");
                emitter.send(event);
            } catch (IOException e) {
                log.warn("Client disconnected during SSE stream (sendChatResponse): {}", e.getMessage());
            } catch (IllegalStateException ex) {
                log.warn("Client disconnected during SSE stream: {}", ex.getMessage());
                throw new RuntimeException("Stop chat generation", ex);
            }
        }
    }

    /**
     * 发送简单消息
     * @param emitter SSE 发射器
     * @param message 消息内容
     */
    public void sendMessage(SseEmitter emitter, String message) {
        try {
            Map<String, String> msg = new HashMap<>();
            msg.put("content", message);
            emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(msg)));
        } catch (IOException e) {
            log.warn("Failed to send message: {}", e.getMessage());
        }
    }

    /**
     * 发送完成事件
     * @param emitter SSE 发射器
     * @param sessionId 会话ID
     */
    public void sendDone(SseEmitter emitter, String sessionId) {
        log.info("对话完成，发送 [DONE] 事件 - sessionId={}", sessionId);
        try {
            emitter.send(SseEmitter.event().data("[DONE]"));
            emitter.complete();
        } catch (Exception e) {
            log.error("发送完成事件失败 - sessionId={}", sessionId, e);
        }
    }

    /**
     * 处理错误
     * @param emitter SSE 发射器
     * @param e 异常
     */
    public void handleError(SseEmitter emitter, Throwable e) {
        // 解包 RuntimeException
        if (e instanceof RuntimeException && "Stop chat generation".equals(e.getMessage()) && e.getCause() != null) {
            e = e.getCause();
        }

        // 检查是否为客户端断开或超时
        String msg = e.getMessage();
        if (e instanceof org.springframework.web.context.request.async.AsyncRequestNotUsableException ||
            e instanceof IllegalStateException ||
            (msg != null && (msg.contains("SocketTimeoutException") ||
                            msg.contains("Broken pipe") ||
                            msg.contains("connection was aborted") ||
                            msg.contains("ResponseBodyEmitter has already completed")))) {
            log.warn("Client disconnected, timed out, or emitter already completed during chat: {}", msg);
            return;
        }

        // 记录错误日志
        log.error("AI Chat Error: ", e);

        try {
            String errorMsg = "AI服务暂时不可用: " + (e.getMessage() != null ? e.getMessage() : "未知错误");
            String json = objectMapper.writeValueAsString(Map.of("content", errorMsg));
            emitter.send(SseEmitter.event().data(json));
            emitter.send(SseEmitter.event().data("[DONE]"));
            emitter.complete();
        } catch (Exception ex) {
            log.warn("Failed to send error response to client: {}", ex.getMessage());
        }
    }

    /**
     * 发送会话更新事件
     * @param emitter SSE 发射器
     * @param sessionId 会话ID
     * @param title 标题
     * @param suggestions 建议列表
     */
    public void sendSessionUpdate(SseEmitter emitter, String sessionId, String title, java.util.List<String> suggestions) {
        try {
            Map<String, Object> sseData = new HashMap<>();
            sseData.put("type", "session_update");
            sseData.put("session_id", sessionId);
            if (title != null) sseData.put("title", title);
            sseData.put("suggestions", suggestions);
            emitter.send(SseEmitter.event().name("session_update").data(objectMapper.writeValueAsString(sseData)));
        } catch (IllegalStateException | IOException ex) {
            log.warn("Client disconnected during suggestion stream: {}", ex.getMessage());
        }
    }

    /**
     * 发送工具调用状态事件
     * @param emitter SSE 发射器
     * @param toolType 工具类型 (search/url_fetch/vocab)
     * @param status 状态 (pending/processing/done/error)
     * @param message 状态消息
     * @param details 详细信息
     */
    public void sendToolStatus(SseEmitter emitter, String toolType, String status, String message, String details) {
        try {
            Map<String, Object> sseData = new HashMap<>();
            sseData.put("type", "tool_status");
            sseData.put("tool_type", toolType);
            sseData.put("status", status);
            sseData.put("message", message);
            if (details != null) {
                sseData.put("details", details);
            }
            emitter.send(SseEmitter.event().name("tool_status").data(objectMapper.writeValueAsString(sseData)));
        } catch (IllegalStateException | IOException ex) {
            log.warn("Client disconnected during tool status stream: {}", ex.getMessage());
        }
    }
}
