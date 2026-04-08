package com.aispring.service;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * AI聊天服务接口
 * 对应Python: app.py中的AI聊天相关功能
 */
public interface AiChatService {
    
    /**
     * AI流式问答
     * @param prompt 提示词
     * @param sessionId 会话ID
     * @param model 模型名称
     * @param userId 用户ID
     * @param ipAddress 客户端IP（用于匿名用户隔离）
     * @param systemPrompt 附加的系统提示词
     * @return SSE发射器，用于流式响应
     */
    SseEmitter askStream(String prompt, String sessionId, String model, Long userId, String ipAddress, String systemPrompt);

    /**
     * AI流式问答（兼容旧接口）
     */
    default SseEmitter askStream(String prompt, String sessionId, String model, Long userId, String ipAddress) {
        return askStream(prompt, sessionId, model, userId, ipAddress, null);
    }
    
    /**
     * AI流式问答 (兼容旧接口)
     */
    default SseEmitter askStream(String prompt, String sessionId, String model, Long userId) {
        return askStream(prompt, sessionId, model, userId, null, null);
    }
    
    /**
     * AI非流式问答
     * @param prompt 提示词
     * @param sessionId 会话ID
     * @param model 模型名称
     * @param userId 用户ID
     * @param systemPrompt 系统提示词
     * @param ipAddress 客户端IP
     * @return 非流式响应
     */
    String ask(String prompt, String sessionId, String model, Long userId, String systemPrompt, String ipAddress);
    
    /**
     * AI非流式问答（兼容旧接口）
     */
    default String ask(String prompt, String sessionId, String model, Long userId, String systemPrompt) {
        return ask(prompt, sessionId, model, userId, systemPrompt, null);
    }

    /**
     * AI非流式问答（默认系统提示词）
     */
    default String ask(String prompt, String sessionId, String model, Long userId) {
        return ask(prompt, sessionId, model, userId, null, null);
    }
}
