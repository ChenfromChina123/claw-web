package com.aispring.service.impl;

import com.aispring.common.prompt.ChatPromptConstants;
import com.aispring.service.AiChatService;
import com.aispring.service.TokenUsageAuditService;
import com.aispring.service.ChatRecordService;
import com.aispring.service.SearchService;
import com.aispring.service.SemanticSearchService;
import com.aispring.service.impl.chat.DeepSeekApiClient;
import com.aispring.service.impl.chat.ChatHistoryBuilder;
import com.aispring.service.impl.chat.SearchInstructionHandler;
import com.aispring.service.impl.chat.SessionMetadataService;
import com.aispring.service.impl.chat.SseChatHandler;
import com.aispring.repository.ChatRecordRepository;
import com.aispring.repository.AnonymousChatRecordRepository;
import com.aispring.repository.WordDictRepository;
import com.aispring.repository.UserWordProgressRepository;
import com.aispring.entity.AnonymousChatRecord;
import com.aispring.entity.WordDict;
import com.aispring.util.SensitiveDataMasker;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.ai.chat.ChatClient;
import org.springframework.ai.chat.StreamingChatClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.annotation.PreDestroy;

/**
 * AI聊天服务实现类
 * 重构后：核心协调服务，委托具体功能给专门的服务类
 */
@Service
@Slf4j
public class AiChatServiceImpl implements AiChatService {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final ObjectProvider<ChatClient> chatClientProvider;
    private final ObjectProvider<StreamingChatClient> streamingChatClientProvider;
    private final ChatRecordRepository chatRecordRepository;
    private final AnonymousChatRecordRepository anonymousChatRecordRepository;
    private final ChatRecordService chatRecordService;
    private final TokenUsageAuditService tokenUsageAuditService;
    private final WordDictRepository wordDictRepository;
    private final UserWordProgressRepository userWordProgressRepository;

    private final DeepSeekApiClient deepSeekApiClient;
    private final ChatHistoryBuilder chatHistoryBuilder;
    private final SearchInstructionHandler searchInstructionHandler;
    private final SessionMetadataService sessionMetadataService;
    private final SseChatHandler sseChatHandler;

    @Value("${ai.max-tokens:4096}")
    private Integer maxTokens;

    @Value("${ai.context.max-saved-chars:200000}")
    private Integer maxSavedChars;

    @Value("${ai.context.max-saved-reasoning-chars:200000}")
    private Integer maxSavedReasoningChars;

    private ChatClient deepseekChatClient;
    private StreamingChatClient deepseekStreamingChatClient;

    private final ExecutorService chatExecutor;

    public AiChatServiceImpl(
            ObjectProvider<ChatClient> chatClientProvider,
            ObjectProvider<StreamingChatClient> streamingChatClientProvider,
            ChatRecordRepository chatRecordRepository,
            AnonymousChatRecordRepository anonymousChatRecordRepository,
            ChatRecordService chatRecordService,
            TokenUsageAuditService tokenUsageAuditService,
            SearchService searchService,
            WordDictRepository wordDictRepository,
            UserWordProgressRepository userWordProgressRepository,
            SemanticSearchService semanticSearchService,
            DeepSeekApiClient deepSeekApiClient,
            ChatHistoryBuilder chatHistoryBuilder,
            SearchInstructionHandler searchInstructionHandler,
            SessionMetadataService sessionMetadataService,
            SseChatHandler sseChatHandler,
            @org.springframework.beans.factory.annotation.Qualifier("chatExecutor") ExecutorService chatExecutor) {

        this.chatClientProvider = chatClientProvider;
        this.streamingChatClientProvider = streamingChatClientProvider;
        this.chatRecordRepository = chatRecordRepository;
        this.anonymousChatRecordRepository = anonymousChatRecordRepository;
        this.chatRecordService = chatRecordService;
        this.tokenUsageAuditService = tokenUsageAuditService;
        this.wordDictRepository = wordDictRepository;
        this.userWordProgressRepository = userWordProgressRepository;
        this.chatExecutor = chatExecutor;

        this.deepSeekApiClient = deepSeekApiClient;
        this.chatHistoryBuilder = chatHistoryBuilder;
        this.searchInstructionHandler = searchInstructionHandler;
        this.sessionMetadataService = sessionMetadataService;
        this.sseChatHandler = sseChatHandler;

        log.info("AiChatServiceImpl initialized with refactored components");
    }

    @PreDestroy
    public void shutdownExecutors() {
        chatExecutor.shutdownNow();
        sessionMetadataService.shutdown();
    }

    @Override
    public SseEmitter askStream(String prompt, String sessionId, String model, Long userId, String ipAddress, String systemPrompt) {
        return askStreamInternal(prompt, sessionId, model, userId, ipAddress, systemPrompt);
    }

    /**
     * 普通流式问答核心实现
     */
    private SseEmitter askStreamInternal(String initialPrompt, String sessionId, String model,
                                         Long userId, String ipAddress, String systemPrompt) {
        SseEmitter emitter = new SseEmitter(300_000L);
        final String finalSessionId = (sessionId == null || sessionId.isEmpty())
                ? java.util.UUID.randomUUID().toString().replace("-", "")
                : sessionId;

        log.info("=== askStreamInternal Called === Model: {}, SessionId: {}, UserId: {}", model, finalSessionId, userId);

        chatExecutor.execute(() -> {
            try {
                StringBuilder fullReasoning = new StringBuilder();
                String fullContent = performBlockingChat(initialPrompt, finalSessionId, model, userId,
                                                         systemPrompt, emitter, ipAddress, fullReasoning);

                // 处理搜索指令
                fullContent = handleSearchInstructions(fullContent, initialPrompt, finalSessionId, model,
                                                       userId, emitter, ipAddress, fullReasoning);

                // 保存聊天记录
                saveChatRecord(initialPrompt, fullContent, fullReasoning, finalSessionId, userId, ipAddress, model);

                // 发送完成事件
                sseChatHandler.sendDone(emitter, finalSessionId);

            } catch (Exception e) {
                sseChatHandler.handleError(emitter, e);
            }
        });

        return emitter;
    }

    /**
     * 执行阻塞式聊天
     */
    private String performBlockingChat(String prompt, String sessionId, String model, Long userId,
                                       String systemPrompt, SseEmitter emitter, String ipAddress,
                                       StringBuilder fullReasoning) throws IOException {
        String maskedPrompt = SensitiveDataMasker.mask(prompt);
        StringBuilder fullContent = new StringBuilder();
        boolean enableThinking = "deepseek-reasoner".equals(model) || "deepseek-r1".equals(model) || model.contains("r1");

        // 构建系统提示词
        String enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);

        // 构建消息列表
        List<Map<String, String>> messages = chatHistoryBuilder.buildMessagesForOkHttp(
            enhancedSystemPrompt, sessionId, userId, ipAddress, maskedPrompt);

        // 异步生成标题和建议
        if (userId != null) {
            sessionMetadataService.generateTitleAndSuggestionsAsync(prompt, sessionId, userId, emitter, model);
        }

        // 发送流式请求
        long startMs = System.currentTimeMillis();
        deepSeekApiClient.streamChat(messages, model, enableThinking, (content, reasoning) -> {
            sseChatHandler.sendChatResponse(emitter, content, reasoning);
            appendWithLimit(fullContent, content, maxSavedChars);
            if (!reasoning.isEmpty()) {
                appendWithLimit(fullReasoning, reasoning, maxSavedReasoningChars);
            }
        });

        // 记录审计
        long responseTimeMs = System.currentTimeMillis() - startMs;
        tokenUsageAuditService.recordEstimated("deepseek", "deepseek-v3", userId, sessionId,
                                               prompt.length(), fullContent.length(), responseTimeMs, true);

        return fullContent.toString();
    }

    /**
     * 处理搜索指令
     */
    private String handleSearchInstructions(String content, String initialPrompt, String sessionId,
                                            String model, Long userId, SseEmitter emitter,
                                            String ipAddress, StringBuilder fullReasoning) throws IOException {
        SearchInstructionHandler.SearchResult searchResult = searchInstructionHandler.detectAndHandleSearch(content);
        if (searchResult != null && searchResult.hasSearch()) {
            // 发送工具调用状态 - 开始搜索
            String searchDisplay = searchResult.getSite() != null && !searchResult.getSite().isEmpty()
                ? searchResult.getKeyword() + " (在 " + searchResult.getSite() + " 中)" : searchResult.getKeyword();
            sseChatHandler.sendToolStatus(emitter, "search", "processing",
                "正在搜索: " + searchDisplay, null);

            String searchResultText = searchInstructionHandler.executeSearch(
                searchResult.getKeyword(), searchResult.getSite());

            // 发送工具调用状态 - 搜索完成
            sseChatHandler.sendToolStatus(emitter, "search", "done",
                "搜索完成", searchResultText);

            String newPrompt = initialPrompt + "\n\n【系统反馈的搜索结果】\n" + searchResultText +
                              "\n\n请根据上述搜索结果回答用户的问题。";

            String secondContent = performBlockingChat(newPrompt, sessionId, model, userId,
                "【系统提示】你已经获取了搜索结果，请直接回答用户问题，不要再输出<search>标签。",
                emitter, ipAddress, fullReasoning);
            return content + "\n\n" + secondContent;
        }

        SearchInstructionHandler.UrlFetchResult urlFetchResult = searchInstructionHandler.detectAndHandleUrlFetch(content);
        if (urlFetchResult != null && urlFetchResult.hasUrlFetch()) {
            // 发送工具调用状态 - 开始获取URL
            sseChatHandler.sendToolStatus(emitter, "url_fetch", "processing",
                "正在获取网页内容", urlFetchResult.getUrl());

            String urlContent = searchInstructionHandler.executeUrlFetch(urlFetchResult.getUrl());

            // 发送工具调用状态 - URL获取完成
            sseChatHandler.sendToolStatus(emitter, "url_fetch", "done",
                "网页内容获取完成", null);

            String newPrompt = initialPrompt + "\n\n【系统反馈的网页内容】\n" + urlContent +
                              "\n\n请根据上述网页内容回答用户的问题。";

            String secondContent = performBlockingChat(newPrompt, sessionId, model, userId,
                "【系统提示】你已经获取了网页内容，请直接回答用户问题，不要再输出<fetch-url>标签。",
                emitter, ipAddress, fullReasoning);
            return content + "\n\n" + secondContent;
        }

        SearchInstructionHandler.VocabResult vocabResult = searchInstructionHandler.detectAndHandleVocab(content);
        if (vocabResult != null && vocabResult.hasVocab()) {
            // 发送工具调用状态 - 开始检索单词
            sseChatHandler.sendToolStatus(emitter, "vocab", "processing",
                "正在检索单词: " + vocabResult.getTopic(), null);

            String ragResult = searchInstructionHandler.executeVocabSearch(
                vocabResult.getTopic(), vocabResult.getLimit());

            // 发送工具调用状态 - 单词检索完成
            sseChatHandler.sendToolStatus(emitter, "vocab", "done",
                "单词检索完成", ragResult);

            String newPrompt = initialPrompt + "\n\n【系统反馈的候选单词数据】\n" + ragResult +
                              "\n\n请严格使用上述数据生成 <vocab-practice> 练习卡片。";

            String secondContent = performBlockingChat(newPrompt, sessionId, model, userId,
                "【系统提示】你已经获取了本地词库数据，请直接生成练习卡片，不要再输出<query-vocab>标签。",
                emitter, ipAddress, fullReasoning);
            return content + "\n\n" + secondContent;
        }

        return content;
    }

    /**
     * 保存聊天记录
     */
    private void saveChatRecord(String prompt, String content, StringBuilder reasoning,
                                String sessionId, Long userId, String ipAddress, String model) {
        if (userId != null) {
            // 已登录用户逻辑由 ChatRecordService 处理
        } else {
            // 匿名用户
            String finalIp = (ipAddress == null || ipAddress.isEmpty()) ? "unknown" : ipAddress;

            AnonymousChatRecord userRecord = AnonymousChatRecord.builder()
                .sessionId(sessionId)
                .ipAddress(finalIp)
                .role("user")
                .content(prompt)
                .model(model)
                .createdAt(java.time.LocalDateTime.now())
                .build();
            anonymousChatRecordRepository.save(userRecord);

            AnonymousChatRecord aiRecord = AnonymousChatRecord.builder()
                .sessionId(sessionId)
                .ipAddress(finalIp)
                .role("assistant")
                .content(truncateToMax(content, maxSavedChars))
                .reasoningContent(truncateToMax(reasoning.toString(), maxSavedReasoningChars))
                .model(model)
                .createdAt(java.time.LocalDateTime.now())
                .build();
            anonymousChatRecordRepository.save(aiRecord);
        }
    }

    /**
     * 构建增强的系统提示词
     */
    private String buildEnhancedSystemPrompt(String systemPrompt) {
        if (systemPrompt == null || systemPrompt.isEmpty()) {
            return ChatPromptConstants.SYSTEM_INSTRUCTIONS;
        }
        return systemPrompt + ChatPromptConstants.SYSTEM_INSTRUCTIONS;
    }

    @Override
    public String ask(String prompt, String sessionId, String model, Long userId, String systemPrompt, String ipAddress) {
        try {
            String maskedPrompt = SensitiveDataMasker.mask(prompt);
            sessionMetadataService.generateTitleAndSuggestionsAsync(prompt, sessionId, userId, null, model);

            String enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);
            List<Map<String, String>> messages = chatHistoryBuilder.buildMessagesForOkHttp(
                enhancedSystemPrompt, sessionId, userId, ipAddress, maskedPrompt);

            long startMs = System.currentTimeMillis();
            String content = deepSeekApiClient.chat(messages, model);

            // 处理搜索指令
            SearchInstructionHandler.SearchResult searchResult = searchInstructionHandler.detectAndHandleSearch(content);
            if (searchResult != null && searchResult.hasSearch()) {
                String searchResultText = searchInstructionHandler.executeSearch(
                    searchResult.getKeyword(), searchResult.getSite());
                String newPrompt = prompt + String.format(ChatPromptConstants.SEARCH_RESULT_FEEDBACK_TEMPLATE, searchResultText);
                return ask(newPrompt, sessionId, model, userId,
                          ChatPromptConstants.SEARCH_RESULT_SYSTEM_PROMPT, ipAddress);
            }

            // 处理URL获取指令
            SearchInstructionHandler.UrlFetchResult urlFetchResult = searchInstructionHandler.detectAndHandleUrlFetch(content);
            if (urlFetchResult != null && urlFetchResult.hasUrlFetch()) {
                String urlContent = searchInstructionHandler.executeUrlFetch(urlFetchResult.getUrl());
                String newPrompt = prompt + String.format(ChatPromptConstants.URL_CONTENT_FEEDBACK_TEMPLATE, urlContent);
                return ask(newPrompt, sessionId, model, userId,
                          ChatPromptConstants.URL_CONTENT_SYSTEM_PROMPT, ipAddress);
            }

            long responseTimeMs = System.currentTimeMillis() - startMs;
            tokenUsageAuditService.recordEstimated("deepseek", "deepseek-v3", userId, sessionId,
                    prompt.length(), content.length(), responseTimeMs, false);

            return content;
        } catch (Exception e) {
            log.error("AI Chat Error in ask(): {}", e.getMessage(), e);
            return fallbackAnswer(prompt);
        }
    }

    /**
     * 追加内容并限制长度
     */
    private void appendWithLimit(StringBuilder sb, String part, int maxChars) {
        if (part == null || part.isEmpty()) return;
        int remain = maxChars - sb.length();
        if (remain <= 0) return;
        if (part.length() <= remain) sb.append(part);
        else sb.append(part, 0, remain);
    }

    /**
     * 截断字符串
     */
    private String truncateToMax(String s, int maxChars) {
        if (s == null) return null;
        if (maxChars <= 0) return "";
        if (s.length() <= maxChars) return s;
        return s.substring(0, maxChars);
    }

    /**
     * 降级回答
     */
    private String fallbackAnswer(String prompt) {
        if (prompt == null || prompt.trim().isEmpty()) return "";
        return "抱歉，AI服务暂不可用。";
    }
}
