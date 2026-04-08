package com.aispring.service.impl;

import com.aispring.common.prompt.SearchPromptConstants;
import com.aispring.entity.WordDict;
import com.aispring.repository.WordDictRepository;
import com.aispring.service.SemanticSearchService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.ChatClient;
import org.springframework.ai.chat.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 语义搜索服务实现类
 * 使用 AI 将中文关键词转换为相关英文单词，实现智能搜索
 */
@Service
@Slf4j
public class SemanticSearchServiceImpl implements SemanticSearchService {

    private final ObjectProvider<ChatClient> chatClientProvider;
    private final WordDictRepository wordDictRepository;

    @Value("${ai.semantic-search.max-words:50}")
    private int maxWords;

    @Value("${ai.semantic-search.enabled:true}")
    private boolean enabled;

    public SemanticSearchServiceImpl(ObjectProvider<ChatClient> chatClientProvider,
                                     WordDictRepository wordDictRepository) {
        this.chatClientProvider = chatClientProvider;
        this.wordDictRepository = wordDictRepository;
    }

    @Override
    public List<WordDict> semanticSearch(String chineseKeyword, int limit) {
        if (!enabled || chineseKeyword == null || chineseKeyword.isBlank()) {
            return smartSearch(chineseKeyword, limit);
        }

        try {
            // 1. 使用 AI 扩展关键词
            List<String> englishWords = expandKeywordsWithAI(chineseKeyword, maxWords);
            
            if (englishWords.isEmpty()) {
                log.warn("AI 未返回扩展关键词，使用智能搜索");
                return smartSearch(chineseKeyword, limit);
            }

            log.info("AI 扩展关键词 [{}] -> {}", chineseKeyword, englishWords);

            // 2. 批量查询英文单词
            List<WordDict> results = wordDictRepository.findByWordIn(englishWords);
            
            // 3. 如果直接匹配结果不足，添加前缀匹配
            if (results.size() < limit) {
                for (String word : englishWords) {
                    if (results.size() >= limit) break;
                    
                    List<WordDict> prefixMatches = wordDictRepository.findByWordPrefix(word, PageRequest.of(0, 5));
                    for (WordDict w : prefixMatches) {
                        if (!results.contains(w)) {
                            results.add(w);
                            if (results.size() >= limit) break;
                        }
                    }
                }
            }

            // 4. 限制返回数量
            return results.size() > limit ? results.subList(0, limit) : results;

        } catch (Exception e) {
            log.error("语义搜索失败，降级为智能搜索：{}", e.getMessage());
            return smartSearch(chineseKeyword, limit);
        }
    }

    @Override
    public List<String> expandKeywordsWithAI(String chineseKeyword, int maxWords) {
        if (!enabled) {
            return Collections.emptyList();
        }

        try {
            ChatClient chatClient = chatClientProvider.getIfAvailable();
            if (chatClient == null) {
                log.warn("ChatClient 不可用");
                return Collections.emptyList();
            }

            String prompt = String.format(SearchPromptConstants.SEMANTIC_SEARCH_PROMPT_TEMPLATE, chineseKeyword, maxWords);

            ChatResponse chatResponse = chatClient.call(new Prompt(prompt));
            String response = chatResponse.getResult().getOutput().getContent();
            
            // 解析响应，提取英文单词
            List<String> words = parseAIResponse(response);
            
            log.info("AI 关键词扩展成功，返回 {} 个单词", words.size());
            return words;

        } catch (Exception e) {
            log.error("AI 关键词扩展失败：{}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    @Override
    public List<WordDict> smartSearch(String keyword, int limit) {
        if (keyword == null || keyword.isBlank()) {
            return Collections.emptyList();
        }

        try {
            // 智能搜索：英文精确匹配、前缀匹配、中文翻译匹配
            List<WordDict> results = wordDictRepository.smartSearch(
                keyword.trim(), 
                PageRequest.of(0, limit)
            );
            
            log.info("智能搜索 [{}] 返回 {} 条结果", keyword, results.size());
            return results;

        } catch (Exception e) {
            log.error("智能搜索失败：{}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 解析 AI 响应，提取英文单词列表
     */
    private List<String> parseAIResponse(String response) {
        if (response == null || response.isBlank()) {
            return Collections.emptyList();
        }

        List<String> words = new ArrayList<>();
        
        // 按行分割
        String[] lines = response.split("\\r?\\n");
        
        // 英文单词正则表达式
        Pattern wordPattern = Pattern.compile("^[a-zA-Z]+[\\-']?[a-zA-Z]*$");
        
        for (String line : lines) {
            String trimmed = line.trim();
            
            // 跳过空行和包含中文的行
            if (trimmed.isEmpty() || trimmed.matches(".*[\\u4e00-\\u9fa5]+.*")) {
                continue;
            }
            
            // 匹配英文单词
            Matcher matcher = wordPattern.matcher(trimmed);
            if (matcher.matches()) {
                String word = trimmed.toLowerCase();
                if (!words.contains(word) && word.length() > 1 && word.length() < 50) {
                    words.add(word);
                }
            }
        }
        
        return words;
    }
}
