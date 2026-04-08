package com.aispring.service;

import com.aispring.entity.ChatRecord;
import com.aispring.entity.ChatSession;
import com.aispring.repository.ChatRecordRepository;
import com.aispring.repository.ChatSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatRecordServiceTest {

    @Mock
    private ChatRecordRepository chatRecordRepository;

    @Mock
    private ChatSessionRepository chatSessionRepository;

    @Mock
    private RedisCacheService redisCacheService;

    @InjectMocks
    private ChatRecordService chatRecordService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void testGetSessionMessagesWithPagination() {
        // 准备测试数据
        Long userId = 1L;
        String sessionId = "test-session-1";
        int page = 1;
        int pageSize = 20;

        // 模拟数据库查询
        List<ChatRecord> mockMessages = new ArrayList<>();
        for (int i = 1; i <= 20; i++) {
            ChatRecord record = ChatRecord.builder()
                    .id((long) i)
                    .userId(userId)
                    .sessionId(sessionId)
                    .messageOrder(i)
                    .senderType(i % 2 + 1) // 1 for user, 2 for AI
                    .content("Test message " + i)
                    .sendTime(LocalDateTime.now().minusMinutes(i))
                    .status("completed")
                    .build();
            mockMessages.add(record);
        }

        // 模拟缓存未命中
        when(redisCacheService.getCachedPagedSessionMessages(sessionId, page, pageSize)).thenReturn(null);
        // 模拟数据库查询
        when(chatRecordRepository.countByUserIdAndSessionId(userId, sessionId)).thenReturn(100L);
        when(chatRecordRepository.findByUserIdAndSessionIdOrderByMessageOrderDesc(userId, sessionId, 0, pageSize))
                .thenReturn(mockMessages);

        // 执行测试
        Map<String, Object> result = chatRecordService.getSessionMessagesWithPagination(userId, sessionId, null, page, pageSize);

        // 验证结果
        assertNotNull(result);
        List<ChatRecord> messages = (List<ChatRecord>) result.get("messages");
        assertEquals(20, messages.size());
        assertEquals(100L, result.get("total"));
        assertEquals(page, result.get("page"));
        assertEquals(pageSize, result.get("pageSize"));

        // 验证缓存被调用
        verify(redisCacheService).getCachedPagedSessionMessages(sessionId, page, pageSize);
        verify(redisCacheService).cachePagedSessionMessages(sessionId, page, pageSize, result);
    }

    @Test
    void testCreateChatRecordClearsCache() {
        // 准备测试数据
        String content = "Test message";
        Integer senderType = 1;
        Long userId = 1L;
        String sessionId = "test-session-1";
        String aiModel = "deepseek";
        String status = "completed";

        // 模拟会话存在
        ChatSession session = ChatSession.builder()
                .sessionId(sessionId)
                .userId(userId)
                .title("Test Session")
                .build();
        when(chatSessionRepository.findBySessionId(sessionId)).thenReturn(java.util.Optional.of(session));

        // 模拟消息顺序
        when(chatRecordRepository.findMaxMessageOrderBySessionIdAndUserId(sessionId, userId)).thenReturn(5);

        // 执行测试
        ChatRecord result = chatRecordService.createChatRecord(content, senderType, userId, sessionId, aiModel, status);

        // 验证结果
        assertNotNull(result);
        assertEquals(content, result.getContent());
        assertEquals(senderType, result.getSenderType());
        assertEquals(userId, result.getUserId());
        assertEquals(sessionId, result.getSessionId());
        assertEquals(6, result.getMessageOrder()); // 应该是6（5+1）

        // 验证缓存被清除
        verify(redisCacheService).deletePagedSessionMessagesCache(sessionId);
        verify(redisCacheService).deleteSessionMessagesCache(sessionId);
        verify(redisCacheService).deleteSessionInfoCache(sessionId);
    }

    @Test
    void testCacheInvalidationOnMessageCreation() {
        // 准备测试数据
        String content = "Test message";
        Integer senderType = 2; // AI message
        Long userId = 1L;
        String sessionId = "test-session-1";
        String aiModel = "deepseek";
        String status = "completed";

        // 模拟会话存在
        ChatSession session = ChatSession.builder()
                .sessionId(sessionId)
                .userId(userId)
                .title("Test Session")
                .build();
        when(chatSessionRepository.findBySessionId(sessionId)).thenReturn(java.util.Optional.of(session));

        // 模拟消息顺序
        when(chatRecordRepository.findMaxMessageOrderBySessionIdAndUserId(sessionId, userId)).thenReturn(10);

        // 执行测试
        ChatRecord result = chatRecordService.createChatRecord(content, senderType, userId, sessionId, aiModel, status);

        // 验证结果
        assertNotNull(result);
        assertEquals(content, result.getContent());
        assertEquals(senderType, result.getSenderType());

        // 验证缓存被清除（对于AI消息也应该清除缓存）
        verify(redisCacheService).deletePagedSessionMessagesCache(sessionId);
        verify(redisCacheService).deleteSessionMessagesCache(sessionId);
        verify(redisCacheService).deleteSessionInfoCache(sessionId);
    }
}
