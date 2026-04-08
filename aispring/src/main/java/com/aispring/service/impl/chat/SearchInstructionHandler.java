package com.aispring.service.impl.chat;

import com.aispring.common.RegexConstants;
import com.aispring.service.SearchService;
import com.aispring.service.SemanticSearchService;
import com.aispring.service.UrlContentService;
import com.aispring.entity.WordDict;
import com.aispring.repository.WordDictRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.regex.Matcher;

/**
 * 搜索指令处理器
 * 负责处理 AI 输出中的搜索指令、URL获取指令和单词检索指令
 */
@Component
@Slf4j
public class SearchInstructionHandler {

    private final SearchService searchService;
    private final SemanticSearchService semanticSearchService;
    private final WordDictRepository wordDictRepository;
    private final UrlContentService urlContentService;

    public SearchInstructionHandler(
            SearchService searchService,
            SemanticSearchService semanticSearchService,
            WordDictRepository wordDictRepository,
            UrlContentService urlContentService) {
        this.searchService = searchService;
        this.semanticSearchService = semanticSearchService;
        this.wordDictRepository = wordDictRepository;
        this.urlContentService = urlContentService;
    }

    /**
     * 检测并处理搜索指令
     * @param content AI 响应内容
     * @return 搜索结果，如果没有搜索指令则返回 null
     */
    public SearchResult detectAndHandleSearch(String content) {
        Matcher matcher = RegexConstants.SEARCH_PATTERN.matcher(content.trim());
        if (matcher.find()) {
            String site = matcher.group(1);
            String keyword = matcher.group(2).trim();
            log.info("检测到AI搜索请求: keyword={}, site={}", keyword, site);
            return new SearchResult(true, keyword, site, null, null);
        }
        return null;
    }

    /**
     * 检测并处理URL获取指令
     * 只支持XML标签格式：<fetch-url>https://example.com</fetch-url>
     * @param content AI 响应内容
     * @return URL获取结果，如果没有URL指令则返回 null
     */
    public UrlFetchResult detectAndHandleUrlFetch(String content) {
        String trimmedContent = content.trim();

        // 只匹配XML标签格式
        Matcher matcher = RegexConstants.URL_PATTERN.matcher(trimmedContent);
        if (matcher.find()) {
            String url = matcher.group(1).trim();
            log.info("检测到AI URL获取请求: url={}", url);
            return new UrlFetchResult(true, url, null);
        }

        return null;
    }

    /**
     * 检测并处理单词检索指令
     * @param content AI 响应内容
     * @return 单词检索结果，如果没有检索指令则返回 null
     */
    public VocabResult detectAndHandleVocab(String content) {
        Matcher matcher = RegexConstants.VOCAB_PATTERN.matcher(content.trim());
        if (matcher.find()) {
            String topic = matcher.group(1);
            int limit = Integer.parseInt(matcher.group(2));
            log.info("检测到AI单词检索请求: topic={}, limit={}", topic, limit);
            return new VocabResult(true, topic, limit, null);
        }
        return null;
    }

    /**
     * 执行搜索
     * @param keyword 关键词
     * @param site 站点限制（可选）
     * @return 搜索结果文本
     */
    public String executeSearch(String keyword, String site) {
        return searchService.searchIndustryInfo(keyword, site);
    }

    /**
     * 执行URL内容获取
     * @param url 目标URL
     * @return URL内容文本
     */
    public String executeUrlFetch(String url) {
        return urlContentService.fetchUrlContent(url);
    }

    /**
     * 执行单词检索
     * @param topic 主题
     * @param limit 数量限制
     * @return RAG 结果 JSON 字符串
     */
    public String executeVocabSearch(String topic, int limit) {
        List<WordDict> words = semanticSearchService.semanticSearch(topic, limit);

        if (words.isEmpty()) {
            log.info("语义搜索无结果，降级为普通搜索");
            Page<WordDict> wordsPage = wordDictRepository.searchByKeyword(topic, PageRequest.of(0, limit));
            words = wordsPage.getContent();

            if (words.isEmpty()) {
                words = wordDictRepository.findRandomWords(limit);
            }
        }

        log.info("RAG 语义搜索到 {} 个相关单词", words.size());
        return buildRagResultJson(words);
    }

    /**
     * 构建 RAG 结果 JSON
     */
    private String buildRagResultJson(List<WordDict> words) {
        StringBuilder ragResult = new StringBuilder("[\n");
        for (int i = 0; i < words.size(); i++) {
            WordDict w = words.get(i);
            ragResult.append("  {\"id\": ").append(w.getId())
                    .append(", \"word\": \"").append(escapeJson(w.getWord())).append("\"")
                    .append(", \"phonetic\": \"").append(escapeJson(w.getPhonetic())).append("\"")
                    .append(", \"definition\": \"").append(escapeJson(w.getDefinition())).append("\"")
                    .append(", \"translation\": \"").append(escapeJson(w.getTranslation())).append("\"")
                    .append(", \"level_tags\": \"").append(w.getLevelTags() != null ? w.getLevelTags() : "").append("\"")
                    .append(", \"user_status\": \"未学\"}");
            if (i < words.size() - 1) {
                ragResult.append(",");
            }
            ragResult.append("\n");
        }
        ragResult.append("]");
        return ragResult.toString();
    }

    /**
     * 转义 JSON 字符串
     */
    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\"", "\\\"").replace("\n", " ");
    }

    /**
     * 构建搜索状态消息
     */
    public String buildSearchStatusMessage(String keyword, String site) {
        String searchDisplay = site != null && !site.isEmpty()
            ? keyword + " (在 " + site + " 中)" : keyword;
        return "\n\n*正在为您搜索: " + searchDisplay + "*...\n\n";
    }

    /**
     * 构建URL获取状态消息
     */
    public String buildUrlFetchStatusMessage(String url) {
        return "\n\n*正在获取网页内容: " + url + "*...\n\n";
    }

    /**
     * 构建单词检索状态消息
     */
    public String buildVocabStatusMessage(String topic) {
        return "\n\n*正在从本地词库为您智能检索 " + topic + " 相关的单词*...\n\n";
    }

    /**
     * 搜索结果数据类
     */
    public static class SearchResult {
        private final boolean hasSearch;
        private final String keyword;
        private final String site;
        private final String result;
        private final String statusMessage;

        public SearchResult(boolean hasSearch, String keyword, String site, String result, String statusMessage) {
            this.hasSearch = hasSearch;
            this.keyword = keyword;
            this.site = site;
            this.result = result;
            this.statusMessage = statusMessage;
        }

        public boolean hasSearch() { return hasSearch; }
        public String getKeyword() { return keyword; }
        public String getSite() { return site; }
        public String getResult() { return result; }
        public String getStatusMessage() { return statusMessage; }
    }

    /**
     * URL获取结果数据类
     */
    public static class UrlFetchResult {
        private final boolean hasUrlFetch;
        private final String url;
        private final String content;

        public UrlFetchResult(boolean hasUrlFetch, String url, String content) {
            this.hasUrlFetch = hasUrlFetch;
            this.url = url;
            this.content = content;
        }

        public boolean hasUrlFetch() { return hasUrlFetch; }
        public String getUrl() { return url; }
        public String getContent() { return content; }
    }

    /**
     * 单词检索结果数据类
     */
    public static class VocabResult {
        private final boolean hasVocab;
        private final String topic;
        private final int limit;
        private final String ragResult;

        public VocabResult(boolean hasVocab, String topic, int limit, String ragResult) {
            this.hasVocab = hasVocab;
            this.topic = topic;
            this.limit = limit;
            this.ragResult = ragResult;
        }

        public boolean hasVocab() { return hasVocab; }
        public String getTopic() { return topic; }
        public int getLimit() { return limit; }
        public String getRagResult() { return ragResult; }
    }
}
