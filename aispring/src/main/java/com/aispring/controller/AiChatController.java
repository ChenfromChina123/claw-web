package com.aispring.controller;

import com.aispring.service.AiChatService;
import com.aispring.service.RateLimitService;
import com.aispring.dto.response.ApiResponse;
import com.aispring.security.CustomUserDetails;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;

/**
 * AI聊天控制器
 * 对应Python: app.py中的/api/ask-stream端点
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class AiChatController {
    
    private final AiChatService aiChatService;
    private final RateLimitService rateLimitService;
    
    @Data
    public static class AskRequest {
        @NotBlank(message = "提示词不能为空")
        private String prompt;
        
        private String session_id;
        
        private String model;
        
        private String system_prompt;
    }
    
    /**
     * AI问答流式接口
     * Python: POST /api/ask-stream
     */
    @PostMapping(value = "/api/ask-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter askStream(
            @Valid @RequestBody AskRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails,
            HttpServletRequest servletRequest) {
        
        String ip = getClientIp(servletRequest);
        
        Long userId = null;
        if (customUserDetails != null) {
            userId = customUserDetails.getUser().getId();
        } else {
            // 匿名用户处理
            if (!rateLimitService.checkAndIncrement(ip)) {
                SseEmitter emitter = new SseEmitter(0L);
                try {
                    // 发送错误消息并关闭
                    Map<String, String> error = new HashMap<>();
                    error.put("content", "您已达到今日免费对话次数上限（5次）。请注册登录后继续使用。");
                    emitter.send(SseEmitter.event().data(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(error)));
                    // 发送结束标记，确保前端正确断开
                    emitter.send(SseEmitter.event().data("[DONE]"));
                    emitter.complete();
                } catch (IOException e) {
                    log.warn("Failed to send rate limit error to client, client likely disconnected: {}", e.getMessage());
                    // 客户端已断开，无需再 completeWithError，直接返回即可
                }
                return emitter;
            }
        }
        
        // 调用AI流式聊天服务
        return aiChatService.askStream(
                request.getPrompt(),
                request.getSession_id(),
                request.getModel(),
                userId,
                ip,
                request.getSystem_prompt());
    }
    
    /**
     * AI问答非流式接口
     * Python: POST /api/ask
     */
    @PostMapping("/api/ask")
    public ResponseEntity<ApiResponse<Map<String, Object>>> ask(
            @Valid @RequestBody AskRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails,
            HttpServletRequest servletRequest) {
        
        Long userId = null;
        if (customUserDetails != null) {
            userId = customUserDetails.getUser().getId();
        } else {
             // 匿名用户处理
            String ip = getClientIp(servletRequest);
            if (!rateLimitService.checkAndIncrement(ip)) {
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .body(ApiResponse.error(429, "您已达到今日免费对话次数上限（5次）。请注册登录后继续使用。"));
            }
        }
        
        String answer = aiChatService.ask(
                request.getPrompt(),
                request.getSession_id(),
                request.getModel(),
                userId,
                request.getSystem_prompt(),
                null);
        
        Map<String, Object> responseData = new HashMap<>();
        responseData.put("answer", answer);
        
        return ResponseEntity.ok(ApiResponse.success(responseData));
    }

    private String getClientIp(HttpServletRequest request) {
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (xfHeader == null) {
            return request.getRemoteAddr();
        }
        return xfHeader.split(",")[0];
    }
}
