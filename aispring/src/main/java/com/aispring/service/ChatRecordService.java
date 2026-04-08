package com.aispring.service;

import com.aispring.common.DateTimeConstants;
import com.aispring.entity.ChatRecord;
import com.aispring.entity.ChatSession;
import com.aispring.entity.User;
import com.aispring.repository.ChatRecordRepository;
import com.aispring.repository.ChatSessionRepository;
import com.aispring.repository.UserRepository;
import com.aispring.repository.AnonymousChatRecordRepository;
import com.aispring.entity.AnonymousChatRecord;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 聊天记录服务
 * 对应Python: chat_records.py
 */
@Service
@RequiredArgsConstructor
public class ChatRecordService {
    
    private final ChatRecordRepository chatRecordRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final UserRepository userRepository;
    private final AnonymousChatRecordRepository anonymousChatRecordRepository;
    private final RedisCacheService redisCacheService;

    /**
     * 创建聊天记录
     */
    @Transactional
    public ChatRecord createChatRecord(String content, Integer senderType, Long userId, 
                                      String sessionId, String aiModel, String status) {
        return createChatRecord(content, senderType, userId, sessionId, aiModel, status, "chat", null);
    }

    @Transactional
    public ChatRecord createChatRecord(String content, Integer senderType, Long userId, 
                                      String sessionId, String aiModel, String status, String sessionType) {
        return createChatRecord(content, senderType, userId, sessionId, aiModel, status, sessionType, null);
    }

    /**
     * 创建聊天记录（包含深度思考内容）
     */
    @Transactional
    public ChatRecord createChatRecord(String content, Integer senderType, Long userId, 
                                      String sessionId, String aiModel, String status, String sessionType, String reasoningContent) {
        return createChatRecord(content, senderType, userId, sessionId, aiModel, status, sessionType, reasoningContent, null, null, null, null, null, null);
    }

    /**
     * 创建聊天记录（包含所有字段，包括工具执行结果和IP）
     */
    @Transactional
    public ChatRecord createChatRecord(String content, Integer senderType, Long userId, 
                                      String sessionId, String aiModel, String status, String sessionType, 
                                      String reasoningContent, Integer exitCode, String stdout, String stderr, String ipAddress,
                                      String searchQuery, String searchResults) {
        
        // 匿名用户处理 (Isolation)
        if (userId == null) {
            String finalIp = ipAddress != null ? ipAddress : "unknown";
            String role = (senderType == 1) ? "user" : "assistant";
            
            AnonymousChatRecord anonymousRecord = AnonymousChatRecord.builder()
                .sessionId(sessionId != null ? sessionId : UUID.randomUUID().toString().replace("-", ""))
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
            if (anonymousRecord.getSessionId() != null) {
                redisCacheService.deletePagedSessionMessagesCache(anonymousRecord.getSessionId());
                redisCacheService.deleteSessionMessagesCache(anonymousRecord.getSessionId());
            }
            
            return mapToChatRecord(anonymousRecord);
        }

        // 如果没有会话ID，生成新的
        if (sessionId == null || sessionId.isEmpty()) {
            sessionId = UUID.randomUUID().toString().replace("-", "");
        }
        
        // 确保 ChatSession 存在
        final String finalSessionId = sessionId;
        final String finalSessionType = sessionType != null ? sessionType : "chat";
        ChatSession session = chatSessionRepository.findBySessionId(sessionId).orElseGet(() -> {
            ChatSession newSession = ChatSession.builder()
                .sessionId(finalSessionId)
                .userId(userId)
                .title("新对话")
                .sessionType(finalSessionType)
                .build();
            return chatSessionRepository.save(newSession);
        });

        // 如果是第一条用户消息且标题是默认的，自动更新标题
        if (senderType == 1 && ("新对话".equals(session.getTitle()) || "未命名会话".equals(session.getTitle()))) {
            String title = content != null && content.length() > 20 ? content.substring(0, 20) + "..." : (content != null ? content : "新对话");
            session.setTitle(title);
            chatSessionRepository.save(session);
        }

        // 获取该会话中最新的消息顺序号
        Integer lastMessageOrder = chatRecordRepository.findMaxMessageOrderBySessionIdAndUserId(sessionId, userId);
        int messageOrder = (lastMessageOrder == null ? 0 : lastMessageOrder) + 1;
        
        // 创建聊天记录
        ChatRecord chatRecord = ChatRecord.builder()
            .sessionId(sessionId)
            .userId(userId)
            .messageOrder(messageOrder)
            .senderType(senderType)
            .content(content != null ? content : "")
            .reasoningContent(reasoningContent)  // 保存深度思考内容
            .searchQuery(searchQuery)
            .searchResults(searchResults)
            .aiModel(aiModel)
            .status(status != null ? status : "completed")
            .sendTime(LocalDateTime.now())
            .exitCode(exitCode)
            .stdout(stdout)
            .stderr(stderr)
            .build();
        
        ChatRecord savedRecord = chatRecordRepository.save(chatRecord);
        
        // 删除缓存
        redisCacheService.deletePagedSessionMessagesCache(sessionId);
        redisCacheService.deleteSessionMessagesCache(sessionId);
        redisCacheService.deleteSessionInfoCache(sessionId);
        
        return savedRecord;
    }

    /**
     * 创建聊天记录（兼容旧接口）
     */
    @Transactional
    public ChatRecord createChatRecord(String content, Integer senderType, Long userId, 
                                      String sessionId, String aiModel, String status, String sessionType, 
                                      String reasoningContent, Integer exitCode, String stdout, String stderr) {
        return createChatRecord(content, senderType, userId, sessionId, aiModel, status, sessionType, reasoningContent, exitCode, stdout, stderr, null, null, null);
    }
    
    /**
     * 获取用户的所有会话列表
     */
    public List<Map<String, Object>> getUserSessions(Long userId) {
        return getUserSessions(userId, "chat");
    }

    /**
     * 获取用户指定类型的会话列表
     */
    public List<Map<String, Object>> getUserSessions(Long userId, String sessionType) {
        // 1. 获取该用户在 chat_records 中的所有唯一会话 ID 和最后一条消息信息
        // 使用自定义查询，支持 session_type 过滤且兼容旧数据（旧数据默认为 'chat'）
        List<Object[]> results = chatRecordRepository.findSessionInfoByUserIdAndType(userId, sessionType);
        
        // 2. 转换为 Map
        return results.stream().map(row -> {
            Map<String, Object> sessionMap = new HashMap<>();
            String sessionId = row[0].toString();
            sessionMap.put("session_id", sessionId);
            
            // 处理时间
            Object t1 = row[1];
            String tm1 = "";
            if (t1 != null) {
                LocalDateTime dt1 = (t1 instanceof LocalDateTime) ? (LocalDateTime) t1
                        : (t1 instanceof java.sql.Timestamp) ? ((java.sql.Timestamp) t1).toLocalDateTime() : null;
                tm1 = dt1 != null ? dt1.format(DateTimeConstants.DATETIME_FORMATTER) : "";
            }
            sessionMap.put("last_message_time", tm1);
            sessionMap.put("created_at", tm1); // 兼容前端字段

            // 获取会话详情（标题和建议）
            Optional<ChatSession> sessionOpt = chatSessionRepository.findBySessionId(sessionId);
            String title = sessionOpt.map(ChatSession::getTitle).orElse(null);
            
            // 如果没有标题，使用最后一条消息内容
            if (title == null || title.isEmpty() || "新对话".equals(title) || "未命名会话".equals(title)) {
                String lastMessage = row[2] != null ? row[2].toString() : "";
                if (lastMessage.length() > 50) {
                    lastMessage = lastMessage.substring(0, 50) + "...";
                }
                title = lastMessage.isEmpty() ? "新对话" : lastMessage;
            }
            
            sessionMap.put("title", title);
            sessionMap.put("last_message", title);
            sessionMap.put("suggestions", sessionOpt.map(ChatSession::getSuggestions).orElse(null));
            
            return sessionMap;
        }).collect(Collectors.toList());
    }
    
    /**
     * 获取会话的所有消息
     */
    public List<ChatRecord> getSessionMessages(Long userId, String sessionId) {
        return getSessionMessages(userId, sessionId, null);
    }

    /**
     * 获取会话的所有消息（支持匿名用户按IP隔离）
     */
    public List<ChatRecord> getSessionMessages(Long userId, String sessionId, String ipAddress) {
        if (userId != null) {
            return chatRecordRepository.findByUserIdAndSessionIdOrderByMessageOrderAsc(userId, sessionId);
        }

        List<AnonymousChatRecord> records = (ipAddress == null || ipAddress.isEmpty())
            ? anonymousChatRecordRepository.findBySessionIdOrderByCreatedAtAsc(sessionId)
            : anonymousChatRecordRepository.findBySessionIdAndIpAddressOrderByCreatedAtAsc(sessionId, ipAddress);
        return records.stream().map(this::mapToChatRecord).collect(Collectors.toList());
    }

    /**
     * 分页获取会话消息
     */
    public Map<String, Object> getSessionMessagesWithPagination(Long userId, String sessionId, String ipAddress, int page, int pageSize) {
        // 尝试从缓存获取数据
        Map<String, Object> cachedResult = redisCacheService.getCachedPagedSessionMessages(sessionId, page, pageSize);
        if (cachedResult != null) {
            return cachedResult;
        }

        Map<String, Object> result = new HashMap<>();
        List<ChatRecord> messages;
        long total;

        if (userId != null) {
            // 计算总数
            total = chatRecordRepository.countByUserIdAndSessionId(userId, sessionId);
            // 分页查询，按消息顺序倒序（最新的消息在前）
            int offset = (page - 1) * pageSize;
            messages = chatRecordRepository.findByUserIdAndSessionIdOrderByMessageOrderDesc(userId, sessionId, offset, pageSize);
            // 反转列表，使最早的消息在前
            Collections.reverse(messages);
        } else {
            // 匿名用户
            if (ipAddress == null || ipAddress.isEmpty()) {
                total = anonymousChatRecordRepository.countBySessionId(sessionId);
                messages = anonymousChatRecordRepository.findBySessionIdOrderByCreatedAtDesc(sessionId, (page - 1) * pageSize, pageSize)
                        .stream().map(this::mapToChatRecord).collect(Collectors.toList());
            } else {
                total = anonymousChatRecordRepository.countBySessionIdAndIpAddress(sessionId, ipAddress);
                messages = anonymousChatRecordRepository.findBySessionIdAndIpAddressOrderByCreatedAtDesc(sessionId, ipAddress, (page - 1) * pageSize, pageSize)
                        .stream().map(this::mapToChatRecord).collect(Collectors.toList());
            }
            // 反转列表，使最早的消息在前
            Collections.reverse(messages);
        }

        result.put("messages", messages);
        result.put("total", total);
        result.put("page", page);
        result.put("pageSize", pageSize);
        
        // 缓存结果
        redisCacheService.cachePagedSessionMessages(sessionId, page, pageSize, result);
        
        return result;
    }
     
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

    /**
     * 获取会话详情
     */
    public Optional<ChatSession> getChatSession(String sessionId) {
        return chatSessionRepository.findBySessionId(sessionId);
    }
    
    /**
     * 更新或创建会话标题和建议
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
    }
    
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
     * 删除特定会话
     */
    @Transactional
    public void deleteSession(Long userId, String sessionId) {
        chatRecordRepository.deleteByUserIdAndSessionId(userId, sessionId);
        chatSessionRepository.findBySessionId(sessionId).ifPresent(session -> {
            if (Objects.equals(session.getUserId(), userId)) {
                chatSessionRepository.deleteBySessionId(sessionId);
            }
        });
    }
    
    /**
     * 创建新会话
     */
    public String createNewSession() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * 创建新会话
     */
    @Transactional
    public ChatSession createChatSession(Long userId, String sessionType) {
        String sessionId = UUID.randomUUID().toString().replace("-", "");
        ChatSession session = ChatSession.builder()
            .sessionId(sessionId)
            .userId(userId)
            .title("新对话")
            .sessionType(sessionType)
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
        
        if (userId != null) {
            return chatSessionRepository.save(session);
        } else {
            // 匿名用户：不保存到 chat_sessions 表，仅返回临时对象
            return session;
        }
    }
    
    /**
     * 管理员：获取所有用户的会话列表
     */
    public List<Map<String, Object>> getAllSessions(Integer skip, Integer limit, Long userIdFilter) {
        List<Object[]> results;
        
        if (userIdFilter != null) {
            results = chatRecordRepository.findSessionsInfoByUserId(userIdFilter);
        } else {
            results = chatRecordRepository.findAllSessionsInfo();
        }
        
        // 应用分页
        int start = skip != null ? skip : 0;
        int end = limit != null ? Math.min(start + limit, results.size()) : results.size();
        
        return results.subList(start, Math.min(end, results.size())).stream().map(row -> {
            Map<String, Object> session = new HashMap<>();
            session.put("session_id", row[0]);
            session.put("user_id", row[1]);
            Object t2 = row[2];
            String tm2 = "";
            if (t2 != null) {
                LocalDateTime dt2 = (t2 instanceof LocalDateTime) ? (LocalDateTime) t2
                        : (t2 instanceof java.sql.Timestamp) ? ((java.sql.Timestamp) t2).toLocalDateTime() : null;
                tm2 = dt2 != null ? dt2.format(DateTimeConstants.DATETIME_FORMATTER) : "";
            }
            session.put("last_message_time", tm2);
            session.put("message_count", row[3]);
            
            // 限制会话标题长度为50个字符
            String lastMessage = row[4] != null ? row[4].toString() : "";
            if (lastMessage.length() > 50) {
                lastMessage = lastMessage.substring(0, 50) + "...";
            }
            session.put("last_message", lastMessage);
            
            // 获取用户名
            Long userId = (Long) row[1];
            if (userId != null) {
                userRepository.findById(userId)
                    .ifPresent(user -> session.put("username", user.getUsername()));
            }
            
            return session;
        }).collect(Collectors.toList());
    }
    
    /**
     * 管理员：获取指定用户特定会话的消息
     */
    public List<Map<String, Object>> getUserSessionMessages(Long userId, String sessionId) {
        List<ChatRecord> messages = chatRecordRepository
            .findByUserIdAndSessionIdOrderByMessageOrderAsc(userId, sessionId);
        
        // 获取用户名
        String username = null;
        Optional<User> user = userRepository.findById(userId);
        if (user.isPresent()) {
            username = user.get().getUsername();
        }
        
        final String finalUsername = username;
        return messages.stream().map(msg -> {
            Map<String, Object> result = msg.toMap();
            result.put("username", finalUsername);
            return result;
        }).collect(Collectors.toList());
    }
    
    /**
     * 管理员：删除指定用户的会话
     */
    @Transactional
    public int deleteUserSession(Long userId, String sessionId) {
        List<ChatRecord> records = chatRecordRepository
            .findByUserIdAndSessionIdOrderByMessageOrderAsc(userId, sessionId);
        int count = records.size();
        chatRecordRepository.deleteByUserIdAndSessionId(userId, sessionId);
        return count;
    }
    
    /**
     * 管理员：获取聊天统计信息
     */
    public Map<String, Object> getChatStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total_messages", chatRecordRepository.countTotalMessages());
        stats.put("total_sessions", chatRecordRepository.countTotalSessions());
        stats.put("active_users", chatRecordRepository.countActiveUsers());
        stats.put("today_messages", chatRecordRepository.countTodayMessages());
        return stats;
    }
}

