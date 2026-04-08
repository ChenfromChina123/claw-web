package com.aispring.service.impl.chat;

import com.aispring.entity.ChatRecord;
import com.aispring.entity.User;
import com.aispring.repository.ChatRecordRepository;
import com.aispring.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 管理员聊天服务
 * 负责管理员相关的聊天记录查询和统计功能
 */
@Service
@RequiredArgsConstructor
public class AdminChatService {

    private final ChatRecordRepository chatRecordRepository;
    private final UserRepository userRepository;
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 获取所有用户的会话列表
     */
    public List<Map<String, Object>> getAllSessions(Integer skip, Integer limit, Long userIdFilter) {
        List<Object[]> results;

        if (userIdFilter != null) {
            results = chatRecordRepository.findSessionsInfoByUserId(userIdFilter);
        } else {
            results = chatRecordRepository.findAllSessionsInfo();
        }

        int start = skip != null ? skip : 0;
        int end = limit != null ? Math.min(start + limit, results.size()) : results.size();

        return results.subList(start, Math.min(end, results.size())).stream().map(this::mapToSessionMap).collect(Collectors.toList());
    }

    /**
     * 获取指定用户特定会话的消息
     */
    public List<Map<String, Object>> getUserSessionMessages(Long userId, String sessionId) {
        List<ChatRecord> messages = chatRecordRepository.findByUserIdAndSessionIdOrderByMessageOrderAsc(userId, sessionId);

        String username = userRepository.findById(userId).map(User::getUsername).orElse(null);
        final String finalUsername = username;

        return messages.stream().map(msg -> {
            Map<String, Object> result = msg.toMap();
            result.put("username", finalUsername);
            return result;
        }).collect(Collectors.toList());
    }

    /**
     * 删除指定用户的会话
     */
    @Transactional
    public int deleteUserSession(Long userId, String sessionId) {
        List<ChatRecord> records = chatRecordRepository.findByUserIdAndSessionIdOrderByMessageOrderAsc(userId, sessionId);
        int count = records.size();
        chatRecordRepository.deleteByUserIdAndSessionId(userId, sessionId);
        return count;
    }

    /**
     * 获取聊天统计信息
     */
    public Map<String, Object> getChatStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total_messages", chatRecordRepository.countTotalMessages());
        stats.put("total_sessions", chatRecordRepository.countTotalSessions());
        stats.put("active_users", chatRecordRepository.countActiveUsers());
        stats.put("today_messages", chatRecordRepository.countTodayMessages());
        return stats;
    }

    /**
     * 映射会话数据
     */
    private Map<String, Object> mapToSessionMap(Object[] row) {
        Map<String, Object> session = new HashMap<>();
        session.put("session_id", row[0]);
        session.put("user_id", row[1]);

        Object t2 = row[2];
        String tm2 = "";
        if (t2 != null) {
            LocalDateTime dt2 = (t2 instanceof LocalDateTime) ? (LocalDateTime) t2
                    : (t2 instanceof java.sql.Timestamp) ? ((java.sql.Timestamp) t2).toLocalDateTime() : null;
            tm2 = dt2 != null ? dt2.format(FORMATTER) : "";
        }
        session.put("last_message_time", tm2);
        session.put("message_count", row[3]);

        String lastMessage = row[4] != null ? row[4].toString() : "";
        if (lastMessage.length() > 50) {
            lastMessage = lastMessage.substring(0, 50) + "...";
        }
        session.put("last_message", lastMessage);

        Long userId = (Long) row[1];
        if (userId != null) {
            userRepository.findById(userId).ifPresent(user -> session.put("username", user.getUsername()));
        }

        return session;
    }
}
