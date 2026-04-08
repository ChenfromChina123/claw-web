package com.aispring.controller;

import com.aispring.entity.WordDict;
import com.aispring.service.impl.WordDictServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 单词词典控制器
 * 提供单词查询、发音缓存等 API 接口
 * 
 * @author AISpring Team
 * @since 2026-03-22
 */
@Slf4j
@RestController
@RequestMapping("/api/word-dict")
@RequiredArgsConstructor
public class WordDictController {

    private final WordDictServiceImpl wordDictService;

    /**
     * 查询单词（带缓存）
     * @param word 单词
     * @return 单词信息
     */
    @GetMapping("/word/{word}")
    public ResponseEntity<Map<String, Object>> getWord(@PathVariable String word) {
        log.info("Querying word: {}", word);
        
        Map<String, Object> response = new HashMap<>();
        Optional<WordDict> wordOpt = wordDictService.findByWordIgnoreCase(word);
        
        if (wordOpt.isPresent()) {
            WordDict wordDict = wordOpt.get();
            response.put("success", true);
            response.put("data", wordDict);
            response.put("pronunciation", wordDictService.getPronunciationUrlWithCache(wordDict.getWord()));
        } else {
            response.put("success", false);
            response.put("message", "单词不存在");
        }
        
        return ResponseEntity.ok(response);
    }

    /**
     * 获取单词发音 URL（带缓存）
     * @param word 单词
     * @return 发音 URL
     */
    @GetMapping("/word/{word}/pronunciation")
    public ResponseEntity<Map<String, String>> getPronunciation(@PathVariable String word) {
        log.info("Getting pronunciation for: {}", word);
        
        String url = wordDictService.getPronunciationUrlWithCache(word);
        
        Map<String, String> response = new HashMap<>();
        response.put("word", word);
        response.put("pronunciation", url);
        response.put("cached", "true"); // 始终使用缓存
        
        return ResponseEntity.ok(response);
    }

    /**
     * 批量获取发音 URL
     * @param words 单词列表（逗号分隔）
     * @return 发音 URL 列表
     */
    @GetMapping("/pronunciations")
    public ResponseEntity<Map<String, Object>> getPronunciations(
            @RequestParam("words") String words) {
        log.info("Getting pronunciations for: {}", words);
        
        String[] wordArray = words.split(",");
        List<String> urls = wordDictService.getPronunciationUrls(List.of(wordArray));
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("count", urls.size());
        response.put("pronunciations", urls);
        
        return ResponseEntity.ok(response);
    }

    /**
     * 智能搜索单词
     * @param keyword 关键词
     * @param limit 返回数量
     * @return 单词列表
     */
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchWords(
            @RequestParam("keyword") String keyword,
            @RequestParam(value = "limit", defaultValue = "10") int limit) {
        log.info("Searching words with keyword: {}, limit: {}", keyword, limit);
        
        List<WordDict> results = wordDictService.smartSearch(keyword, limit);
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("count", results.size());
        response.put("data", results);
        
        return ResponseEntity.ok(response);
    }

    /**
     * 清除单词缓存
     * @param word 单词
     * @return 操作结果
     */
    @DeleteMapping("/cache/{word}")
    public ResponseEntity<Map<String, Object>> evictCache(@PathVariable String word) {
        log.info("Evicting cache for word: {}", word);
        
        wordDictService.evictWordCache(word);
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "缓存已清除");
        
        return ResponseEntity.ok(response);
    }

    /**
     * 预加载高频单词
     * @return 操作结果
     */
    @PostMapping("/cache/preload")
    public ResponseEntity<Map<String, Object>> preloadCache() {
        log.info("Preloading high-frequency words to cache");
        
        wordDictService.preloadHighFrequencyWords();
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "高频单词已预加载到缓存");
        
        return ResponseEntity.ok(response);
    }

    /**
     * 获取缓存统计信息
     * @return 缓存统计
     */
    @GetMapping("/cache/stats")
    public ResponseEntity<Map<String, Object>> getCacheStats() {
        log.info("Getting cache statistics");
        
        WordDictServiceImpl.CacheStats stats = wordDictService.getCacheStats();
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("data", stats);
        
        return ResponseEntity.ok(response);
    }
}
