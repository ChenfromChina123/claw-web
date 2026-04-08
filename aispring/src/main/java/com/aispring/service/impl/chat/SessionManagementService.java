package com.aispring.service.impl.chat;

import com.aispring.entity.ChatSession;
import com.aispring.repository.ChatSessionRepository;
import com.aispring.service.RedisCacheService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * 会话管理服务
 * 负责会话的创建、更新、查询和删除
 */
@Service
@RequiredArgsConstructor
public class SessionManagementService {

    private final ChatSessionRepository chatSessionRepository;
    private final RedisCacheService redisCacheService;

    /**
     * 获取会话详情
     */
    public Optional<ChatSession> getChatSession(String sessionId) {
        return chatSessionRepository.findBySessionId(sessionId);
    }

    /**
     * 创建新会话ID
     */
    public String createNewSessionId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * 创建新会话
     */
    @Transactional
    public ChatSession createChatSession(Long userId, String sessionType) {
        String sessionId = createNewSessionId();
        ChatSession session = ChatSession.builder()
            .sessionId(sessionId)
            .userId(userId)
            .title("新对话")
            .sessionType(sessionType != null ? sessionType : "chat")
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();

        if (userId != null) {
            return chatSessionRepository.save(session);
        }
        return session;
    }

    /**
     * 确保会话存在
     */
    @Transactional
    public ChatSession ensureSessionExists(String sessionId, Long userId, String sessionType) {
        if (sessionId == null || sessionId.isEmpty()) {
            sessionId = createNewSessionId();
        }

        final String finalSessionId = sessionId;
        final String finalSessionType = sessionType != null ? sessionType : "chat";

        return chatSessionRepository.findBySessionId(sessionId).orElseGet(() -> {
            ChatSession newSession = ChatSession.builder()
                .sessionId(finalSessionId)
                .userId(userId)
                .title("新对话")
                .sessionType(finalSessionType)
                .build();
            return chatSessionRepository.save(newSession);
        });
    }

    /**
     * 更新会话标题和建议
     */
    @Transactional
    public void updateSessionTitleAndSuggestions(String sessionId, String title, String suggestions, Long userId) {
        ChatSession session = chatSessionRepository.findBySessionId(sessionId).orElseGet(() -> {
            return ChatSession.builder()
                .sessionId(sessionId)
                .userId(userId)
                .title("新对话")
                .build();
        });

        if (title != null && !title.isEmpty()) {
            session.setTitle(title);
        }
        if (suggestions != null && !suggestions.isEmpty()) {
            session.setSuggestions(suggestions);
        }
        chatSessionRepository.save(session);

        // 删除缓存
        redisCacheService.deleteSessionInfoCache(sessionId);
    }

    /**
     * 更新会话标题（如果是第一条消息）
     */
    @Transactional
    public void updateTitleIfFirstMessage(ChatSession session, String content, Integer senderType) {
        if (senderType == 1 && ("新对话".equals(session.getTitle()) || "未命名会话".equals(session.getTitle()))) {
            String title = content != null && content.length() > 20
                ? content.substring(0, 20) + "..."
                : (content != null ? content : "新对话");
            session.setTitle(title);
            chatSessionRepository.save(session);
        }
    }

    /**
     * 更新会话当前工作目录
     */
    @Transactional
    public void updateSessionCwd(String sessionId, String cwd, Long userId) {
        chatSessionRepository.findBySessionId(sessionId).ifPresent(session -> {
            if (Objects.equals(session.getUserId(), userId)) {
                session.setCurrentCwd(cwd);
                chatSessionRepository.save(session);
            }
        });
    }

    /**
     * 获取会话的当前工作目录
     */
    public String getSessionCwd(String sessionId, Long userId) {
        return chatSessionRepository.findBySessionId(sessionId)
            .filter(session -> Objects.equals(session.getUserId(), userId))
            .map(ChatSession::getCurrentCwd)
            .orElse("/");
    }

    /**
     * 删除会话
     */
    @Transactional
    public void deleteSession(Long userId, String sessionId) {
        chatSessionRepository.findBySessionId(sessionId).ifPresent(session -> {
            if (Objects.equals(session.getUserId(), userId)) {
                chatSessionRepository.deleteBySessionId(sessionId);
            }
        });
    }
}
