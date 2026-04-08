package com.aispring.service.impl.chat;

import com.aispring.entity.ChatRecord;
import com.aispring.entity.AnonymousChatRecord;
import com.aispring.repository.ChatRecordRepository;
import com.aispring.repository.AnonymousChatRecordRepository;
import com.aispring.util.SensitiveDataMasker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 聊天历史消息构建器
 * 负责构建对话历史上下文，支持已登录用户和匿名用户
 */
@Component
@Slf4j
public class ChatHistoryBuilder {

    private final ChatRecordRepository chatRecordRepository;
    private final AnonymousChatRecordRepository anonymousChatRecordRepository;
    private final Integer maxHistoryMessages;
    private final Integer maxHistoryChars;
    private final Integer maxToolResultChars;

    public ChatHistoryBuilder(
            ChatRecordRepository chatRecordRepository,
            AnonymousChatRecordRepository anonymousChatRecordRepository,
            @Value("${ai.context.max-history-messages:30}") Integer maxHistoryMessages,
            @Value("${ai.context.max-history-chars:20000}") Integer maxHistoryChars,
            @Value("${ai.context.max-tool-result-chars:8000}") Integer maxToolResultChars) {
        this.chatRecordRepository = chatRecordRepository;
        this.anonymousChatRecordRepository = anonymousChatRecordRepository;
        this.maxHistoryMessages = maxHistoryMessages;
        this.maxHistoryChars = maxHistoryChars;
        this.maxToolResultChars = maxToolResultChars;
    }

    /**
     * 构建消息列表（用于 OkHttp 请求）
     * @param systemPrompt 系统提示词
     * @param sessionId 会话ID
     * @param userId 用户ID（可为null，表示匿名用户）
     * @param ipAddress IP地址（匿名用户需要）
     * @param currentPrompt 当前用户输入
     * @return 消息列表
     */
    public List<Map<String, String>> buildMessagesForOkHttp(String systemPrompt, String sessionId,
                                                            Long userId, String ipAddress, String currentPrompt) {
        List<Map<String, String>> messages = new ArrayList<>();
        
        // 添加系统提示词
        if (systemPrompt != null && !systemPrompt.isEmpty()) {
            Map<String, String> sysMsg = new HashMap<>();
            sysMsg.put("role", "system");
            sysMsg.put("content", systemPrompt);
            messages.add(sysMsg);
        }

        // 添加历史消息
        if (sessionId != null && !sessionId.isEmpty()) {
            List<Map<String, String>> historyMessages = buildHistoryMessages(sessionId, userId, ipAddress);
            messages.addAll(historyMessages);
        }

        // 添加当前用户消息
        Map<String, String> currentMsg = new HashMap<>();
        currentMsg.put("role", "user");
        currentMsg.put("content", currentPrompt);
        messages.add(currentMsg);

        return messages;
    }

    /**
     * 构建历史消息列表
     */
    private List<Map<String, String>> buildHistoryMessages(String sessionId, Long userId, String ipAddress) {
        int budget = maxHistoryChars == null ? 0 : Math.max(0, maxHistoryChars);
        List<Map<String, String>> reversedIncluded = new ArrayList<>();

        if (userId != null) {
            // 已登录用户：查询 ChatRecord
            List<ChatRecord> history = chatRecordRepository.findByUserIdAndSessionIdOrderByMessageOrderDesc(
                userId, sessionId,
                PageRequest.of(0, maxHistoryMessages == null ? 0 : Math.max(0, maxHistoryMessages))
            );
            for (ChatRecord record : history) {
                if (budget <= 0) break;
                String role = (record.getSenderType() == 1 || record.getSenderType() == 3) ? "user" : "assistant";
                String content = record.getContent();
                if (record.getSenderType() != null && record.getSenderType() == 3) {
                    content = truncateToMax(content, maxToolResultChars);
                }
                if (content == null || content.isEmpty()) continue;
                if ("user".equals(role)) content = SensitiveDataMasker.mask(content);
                budget -= content.length();
                Map<String, String> msg = new HashMap<>();
                msg.put("role", role);
                msg.put("content", content);
                reversedIncluded.add(msg);
            }
        } else {
            // 匿名用户：查询 AnonymousChatRecord
            List<AnonymousChatRecord> history = (ipAddress == null || ipAddress.isEmpty())
                ? anonymousChatRecordRepository.findBySessionIdOrderByCreatedAtDesc(
                    sessionId,
                    PageRequest.of(0, maxHistoryMessages == null ? 0 : Math.max(0, maxHistoryMessages))
                )
                : anonymousChatRecordRepository.findBySessionIdAndIpAddressOrderByCreatedAtDesc(
                    sessionId, ipAddress,
                    PageRequest.of(0, maxHistoryMessages == null ? 0 : Math.max(0, maxHistoryMessages))
                );
            for (AnonymousChatRecord record : history) {
                if (budget <= 0) break;
                String role = "user".equalsIgnoreCase(record.getRole()) ? "user" : "assistant";
                String content = record.getContent();
                if (content == null || content.isEmpty()) continue;
                if ("user".equals(role)) content = SensitiveDataMasker.mask(content);
                budget -= content.length();
                Map<String, String> msg = new HashMap<>();
                msg.put("role", role);
                msg.put("content", content);
                reversedIncluded.add(msg);
            }
        }

        Collections.reverse(reversedIncluded);
        return reversedIncluded;
    }

    /**
     * 构建用于标题和建议生成的用户提示词
     * @param userPrompt 当前用户输入
     * @param sessionId 会话ID
     * @param userId 用户ID
     * @return 构建后的提示词
     */
    public String buildTitleAndSuggestionsUserPrompt(String userPrompt, String sessionId, Long userId) {
        final int maxHistoryQuestions = 6;
        final int maxEachQuestionChars = 180;
        final int maxHistoryTotalChars = 1200;

        String current = userPrompt == null ? "" : userPrompt.trim();
        if (current.isEmpty()) current = "(空)";
        String currentForCompare = current.replaceAll("\\s+", " ").trim();

        if (sessionId == null || sessionId.isEmpty()) {
            return "【当前用户询问（最重要）】\n" + current + "\n";
        }

        List<ChatRecord> history;
        if (userId != null) {
            history = chatRecordRepository.findByUserIdAndSessionIdOrderByMessageOrderAsc(userId, sessionId);
        } else {
            history = chatRecordRepository.findBySessionIdOrderByMessageOrderAsc(sessionId);
        }

        if (history == null || history.isEmpty()) {
            return "【当前用户询问（最重要）】\n" + current + "\n";
        }

        List<String> userQuestions = extractUserQuestions(history, currentForCompare, maxHistoryQuestions, maxEachQuestionChars);

        StringBuilder sb = new StringBuilder();
        sb.append("【当前用户询问（最重要）】\n").append(current).append("\n");
        if (!userQuestions.isEmpty()) {
            sb.append("\n【历史用户询问（仅供参考，已截断）】\n");
            int appended = 0;
            for (int i = userQuestions.size() - 1; i >= 0; i--) {
                String q = userQuestions.get(i);
                int nextLen = q.length() + 3;
                if (appended + nextLen > maxHistoryTotalChars) break;
                sb.append("- ").append(q).append("\n");
                appended += nextLen;
            }
        }
        return sb.toString();
    }

    /**
     * 从历史记录中提取用户问题
     */
    private List<String> extractUserQuestions(List<ChatRecord> history, String currentForCompare,
                                              int maxQuestions, int maxChars) {
        List<String> userQuestions = new ArrayList<>();
        for (int i = history.size() - 1; i >= 0; i--) {
            ChatRecord record = history.get(i);
            if (record == null) continue;
            if (record.getSenderType() != 1) continue;
            String q = record.getContent();
            if (q == null) continue;
            q = q.trim();
            if (q.isEmpty()) continue;
            if (q.length() > maxChars) q = q.substring(0, maxChars) + "...";
            String qForCompare = q.replaceAll("\\s+", " ").trim();
            if (qForCompare.equals(currentForCompare)) continue;
            userQuestions.add(q);
            if (userQuestions.size() >= maxQuestions) break;
        }
        return userQuestions;
    }

    /**
     * 截断字符串到指定长度
     */
    private String truncateToMax(String s, int maxChars) {
        if (s == null) return null;
        if (maxChars <= 0) return "";
        if (s.length() <= maxChars) return s;
        return s.substring(0, maxChars);
    }
}
