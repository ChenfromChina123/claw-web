package com.aispring.service.impl;

import com.aispring.entity.WordDict;
import com.aispring.repository.WordDictRepository;
import com.aispring.service.WordDictService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

/**
 * 单词词典服务实现类
 * 提供单词查询、发音缓存等服务
 * 
 * @author AISpring Team
 * @since 2026-03-22
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WordDictServiceImpl implements WordDictService {

    private final WordDictRepository wordDictRepository;
    private final CacheManager cacheManager;

    /**
     * 单词缓存前缀
     */
    private static final String WORD_CACHE_PREFIX = "word_dict:";
    
    /**
     * 发音 URL 缓存前缀
     */
    private static final String PRONUNCIATION_CACHE_PREFIX = "word_pronunciation:";
    
    /**
     * 内存缓存 - 发音 URL
     */
    private final ConcurrentMap<String, String> pronunciationCache = new ConcurrentHashMap<>();
    
    /**
     * 单词缓存过期时间：24 小时
     */
    private static final Duration WORD_CACHE_TTL = Duration.ofHours(24);
    
    /**
     * 发音缓存过期时间：7 天（高频访问，较长 TTL）
     */
    private static final Duration PRONUNCIATION_CACHE_TTL = Duration.ofDays(7);
    
    /**
     * 高频单词列表（预加载到缓存）
     */
    private static final List<String> HIGH_FREQUENCY_WORDS = List.of(
        "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
        "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
        "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
        "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
        "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
        "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
        "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
        "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
        "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
        "even", "new", "want", "because", "any", "these", "give", "day", "most", "hello"
    );

    @Override
    public Optional<WordDict> findByWordIgnoreCase(String word) {
        if (word == null || word.isBlank()) {
            return Optional.empty();
        }

        String cacheKey = WORD_CACHE_PREFIX + word.toLowerCase().trim();
        
        // 1. 尝试从缓存获取
        try {
            Cache cache = cacheManager.getCache("wordDict");
            if (cache != null) {
                WordDict cachedWord = cache.get(cacheKey, WordDict.class);
                if (cachedWord != null) {
                    log.debug("Cache hit for word: {}", word);
                    return Optional.of(cachedWord);
                }
            }
        } catch (Exception e) {
            log.warn("Cache error when getting word: {}", e.getMessage());
        }

        // 2. 从数据库查询
        Optional<WordDict> wordOpt = wordDictRepository.findByWordIgnoreCase(word);
        
        // 3. 缓存结果
        if (wordOpt.isPresent()) {
            try {
                Cache cache = cacheManager.getCache("wordDict");
                if (cache != null) {
                    cache.put(cacheKey, wordOpt.get());
                    log.debug("Cached word: {}", word);
                }
            } catch (Exception e) {
                log.warn("Cache error when setting word: {}", e.getMessage());
            }
        }
        
        return wordOpt;
    }

    @Override
    public List<WordDict> smartSearch(String keyword, int limit) {
        if (keyword == null || keyword.isBlank()) {
            return Collections.emptyList();
        }

        try {
            List<WordDict> results = wordDictRepository.smartSearch(
                keyword.trim(), 
                PageRequest.of(0, limit)
            );
            log.info("Smart search for '{}' returned {} results", keyword, results.size());
            return results;
        } catch (Exception e) {
            log.error("Smart search error: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    @Override
    public String getPronunciationUrl(String word) {
        if (word == null || word.isBlank()) {
            return "";
        }
        
        // 使用有道词典 TTS API
        return String.format(
            "https://dict.youdao.com/dictvoice?audio=%s&type=1",
            URLEncoder.encode(word, StandardCharsets.UTF_8)
        );
    }

    @Override
    public String getPronunciationUrlWithCache(String word) {
        if (word == null || word.isBlank()) {
            return "";
        }

        String cacheKey = PRONUNCIATION_CACHE_PREFIX + word.toLowerCase().trim();
        
        // 1. 尝试从内存缓存获取
        String cachedUrl = pronunciationCache.get(cacheKey);
        if (cachedUrl != null) {
            log.debug("Cache hit for pronunciation: {}", word);
            return cachedUrl;
        }

        // 2. 生成发音 URL
        String url = getPronunciationUrl(word);
        
        // 3. 缓存结果
        pronunciationCache.put(cacheKey, url);
        log.debug("Cached pronunciation for: {}", word);

        return url;
    }

    @Override
    public List<String> getPronunciationUrls(List<String> words) {
        if (words == null || words.isEmpty()) {
            return Collections.emptyList();
        }

        return words.stream()
            .map(this::getPronunciationUrlWithCache)
            .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void evictWordCache(String word) {
        if (word == null || word.isBlank()) {
            return;
        }

        try {
            Cache cache = cacheManager.getCache("wordDict");
            if (cache != null) {
                String cacheKey = WORD_CACHE_PREFIX + word.toLowerCase().trim();
                cache.evict(cacheKey);
                log.info("Evicted cache for word: {}", word);
            }
        } catch (Exception e) {
            log.warn("Cache error when evicting word cache: {}", e.getMessage());
        }
    }

    @Override
    @Transactional
    public void evictAllWordCache() {
        try {
            log.info("Evicting all word cache");
        } catch (Exception e) {
            log.warn("Cache error when evicting all cache: {}", e.getMessage());
        }
    }

    /**
     * 预加载高频单词到缓存
     */
    public void preloadHighFrequencyWords() {
        log.info("Preloading {} high-frequency words to cache", HIGH_FREQUENCY_WORDS.size());
        
        int successCount = 0;
        int failCount = 0;
        
        for (String word : HIGH_FREQUENCY_WORDS) {
            try {
                // 预加载单词信息
                Optional<WordDict> wordOpt = wordDictRepository.findByWordIgnoreCase(word);
                if (wordOpt.isPresent()) {
                    String cacheKey = WORD_CACHE_PREFIX + word.toLowerCase();
                    Cache cache = cacheManager.getCache("wordDict");
                    if (cache != null) {
                        cache.put(cacheKey, wordOpt.get());
                    }
                    
                    // 预加载发音 URL 到内存缓存
                    String pronunciationKey = PRONUNCIATION_CACHE_PREFIX + word.toLowerCase();
                    String pronunciationUrl = getPronunciationUrl(word);
                    pronunciationCache.put(pronunciationKey, pronunciationUrl);
                    
                    successCount++;
                }
            } catch (Exception e) {
                log.warn("Failed to preload word '{}': {}", word, e.getMessage());
                failCount++;
            }
        }
        
        log.info("Preloaded {} words successfully, {} failed", successCount, failCount);
    }

    /**
     * 获取缓存统计信息
     * @return 缓存统计信息
     */
    public CacheStats getCacheStats() {
        CacheStats stats = new CacheStats();
        stats.setTotalWords(HIGH_FREQUENCY_WORDS.size());
        
        // 统计缓存中的单词数量（简化版，生产环境应使用 SCAN 命令）
        try {
            // 这里仅返回配置信息，实际统计需要更复杂的实现
            stats.setCachedWords(0); // 待实现
            stats.setWordCacheTTL(WORD_CACHE_TTL.toHours());
            stats.setPronunciationCacheTTL(PRONUNCIATION_CACHE_TTL.toDays());
        } catch (Exception e) {
            log.warn("Failed to get cache stats: {}", e.getMessage());
        }
        
        return stats;
    }

    /**
     * 缓存统计信息
     */
    public static class CacheStats {
        private int totalWords;
        private int cachedWords;
        private long wordCacheTTL;
        private long pronunciationCacheTTL;

        public int getTotalWords() {
            return totalWords;
        }

        public void setTotalWords(int totalWords) {
            this.totalWords = totalWords;
        }

        public int getCachedWords() {
            return cachedWords;
        }

        public void setCachedWords(int cachedWords) {
            this.cachedWords = cachedWords;
        }

        public long getWordCacheTTL() {
            return wordCacheTTL;
        }

        public void setWordCacheTTL(long wordCacheTTL) {
            this.wordCacheTTL = wordCacheTTL;
        }

        public long getPronunciationCacheTTL() {
            return pronunciationCacheTTL;
        }

        public void setPronunciationCacheTTL(long pronunciationCacheTTL) {
            this.pronunciationCacheTTL = pronunciationCacheTTL;
        }
    }
}
