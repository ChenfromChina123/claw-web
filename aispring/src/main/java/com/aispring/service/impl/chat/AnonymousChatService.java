package com.aispring.service.impl.chat;

import com.aispring.entity.AnonymousChatRecord;
import com.aispring.entity.ChatRecord;
import com.aispring.repository.AnonymousChatRecordRepository;
import com.aispring.service.RedisCacheService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 匿名用户聊天服务
 * 负责匿名用户的聊天记录管理
 */
@Service
@RequiredArgsConstructor
public class AnonymousChatService {

    private final AnonymousChatRecordRepository anonymousChatRecordRepository;
    private final RedisCacheService redisCacheService;

    /**
     * 创建匿名用户聊天记录
     */
    @Transactional
    public ChatRecord createAnonymousRecord(String content, Integer senderType, String sessionId,
                                            String ipAddress, String aiModel, String reasoningContent,
                                            String searchQuery, String searchResults) {
        String finalIp = ipAddress != null ? ipAddress : "unknown";
        String role = (senderType == 1) ? "user" : "assistant";
        String finalSessionId = sessionId != null ? sessionId : UUID.randomUUID().toString().replace("-", "");

        AnonymousChatRecord anonymousRecord = AnonymousChatRecord.builder()
            .sessionId(finalSessionId)
            .ipAddress(finalIp)
            .role(role)
            .content(content)
            .reasoningContent(reasoningContent)
            .searchQuery(searchQuery)
            .searchResults(searchResults)
            .model(aiModel)
            .createdAt(LocalDateTime.now())
            .build();

        anonymousChatRecordRepository.save(anonymousRecord);

        // 删除缓存
        redisCacheService.deletePagedSessionMessagesCache(finalSessionId);
        redisCacheService.deleteSessionMessagesCache(finalSessionId);

        return mapToChatRecord(anonymousRecord);
    }

    /**
     * 获取匿名用户会话消息
     */
    public List<ChatRecord> getSessionMessages(String sessionId, String ipAddress) {
        List<AnonymousChatRecord> records = (ipAddress == null || ipAddress.isEmpty())
            ? anonymousChatRecordRepository.findBySessionIdOrderByCreatedAtAsc(sessionId)
            : anonymousChatRecordRepository.findBySessionIdAndIpAddressOrderByCreatedAtAsc(sessionId, ipAddress);
        return records.stream().map(this::mapToChatRecord).collect(Collectors.toList());
    }

    /**
     * 分页获取匿名用户会话消息
     */
    public List<ChatRecord> getPaginatedSessionMessages(String sessionId, String ipAddress, int offset, int pageSize) {
        List<AnonymousChatRecord> records = (ipAddress == null || ipAddress.isEmpty())
            ? anonymousChatRecordRepository.findBySessionIdOrderByCreatedAtDesc(sessionId, offset, pageSize)
            : anonymousChatRecordRepository.findBySessionIdAndIpAddressOrderByCreatedAtDesc(sessionId, ipAddress, offset, pageSize);
        List<ChatRecord> result = records.stream().map(this::mapToChatRecord).collect(Collectors.toList());
        Collections.reverse(result);
        return result;
    }

    /**
     * 统计匿名用户会话消息数量
     */
    public long countSessionMessages(String sessionId, String ipAddress) {
        if (ipAddress == null || ipAddress.isEmpty()) {
            return anonymousChatRecordRepository.countBySessionId(sessionId);
        }
        return anonymousChatRecordRepository.countBySessionIdAndIpAddress(sessionId, ipAddress);
    }

    /**
     * 将匿名聊天记录映射为 ChatRecord
     */
    private ChatRecord mapToChatRecord(AnonymousChatRecord ar) {
        return ChatRecord.builder()
            .sessionId(ar.getSessionId())
            .senderType("user".equalsIgnoreCase(ar.getRole()) ? 1 : 2)
            .content(ar.getContent())
            .reasoningContent(ar.getReasoningContent())
            .searchQuery(ar.getSearchQuery())
            .searchResults(ar.getSearchResults())
            .sendTime(ar.getCreatedAt())
            .aiModel(ar.getModel())
            .status("completed")
            .messageOrder(0)
            .build();
    }
}
