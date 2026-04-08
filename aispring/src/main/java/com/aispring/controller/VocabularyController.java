package com.aispring.controller;

import com.aispring.entity.*;
import com.aispring.exception.CustomException;
import com.aispring.service.VocabularyService;
import com.aispring.dto.response.MessageResponse;
import com.aispring.security.CustomUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 词汇学习控制器
 * 对应Python: language_learning.py中的词汇相关端点
 */
@RestController
@RequestMapping("/api/vocabulary")
@RequiredArgsConstructor
public class VocabularyController {
    
    private final VocabularyService vocabularyService;
    
    // DTO类
    @Data
    public static class CreateVocabularyListRequest {
        @NotBlank(message = "名称不能为空")
        private String name;
        private String description;
        private String language = "en";
    }
    
    @Data
    public static class AddWordRequest {
        @NotBlank(message = "单词不能为空")
        private String word;
        private String definition;
        private String partOfSpeech;
        private String example;
        private String language = "en";
    }
    
    @Data
    public static class UpdateProgressRequest {
        @NotNull(message = "单词ID不能为空")
        private Integer wordId;
        private Integer masteryLevel;
        private Boolean isDifficult;
    }
    
    @Data
    public static class RecordActivityRequest {
        @NotBlank(message = "活动类型不能为空")
        private String activityType;
        private String activityDetails;
        private Integer duration;
    }

    @Data
    public static class GenerateTopicsRequest {
        private List<String> words;
        private String language = "en";
    }

    @Data
    public static class GenerateArticleRequest {
        private Integer listId;
        private List<Integer> wordIds;
        private String topic;
        private String difficulty;
        private String length;
        private String targetLanguage;
    }

    @Data
    public static class GeneratePdfRequest {
        @NotBlank(message = "HTML内容不能为空")
        private String html;
        private String filename;
    }
    
    /**
     * 创建单词表
     * Python: POST /api/vocabulary/lists
     */
    @PostMapping("/lists")
    public ResponseEntity<VocabularyList> createVocabularyList(
            @Valid @RequestBody CreateVocabularyListRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        VocabularyList list = vocabularyService.createVocabularyList(
            userId, request.getName(), request.getDescription(), request.getLanguage());
        
        return ResponseEntity.ok(list);
    }
    
    /**
     * 获取用户的单词表列表
     * Python: GET /api/vocabulary/lists
     */
    @GetMapping("/lists")
    public ResponseEntity<Map<String, Object>> getVocabularyLists(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        List<VocabularyList> lists = vocabularyService.getUserVocabularyLists(userId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("lists", lists);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * 添加单词到单词表
     * Python: POST /api/vocabulary/lists/{listId}/words
     */
    @PostMapping("/lists/{listId}/words")
    public ResponseEntity<VocabularyWord> addWord(
            @PathVariable Integer listId,
            @Valid @RequestBody AddWordRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        
        VocabularyWord word = vocabularyService.addWordToList(
            listId, request.getWord(), request.getDefinition(), 
            request.getPartOfSpeech(), request.getExample(), request.getLanguage());
        
        return ResponseEntity.ok(word);
    }
    
    /**
     * 获取单词表中的所有单词
     * Python: GET /api/vocabulary/lists/{listId}/words
     */
    @GetMapping("/lists/{listId}/words")
    public ResponseEntity<Map<String, Object>> getWords(
            @PathVariable Integer listId,
            @AuthenticationPrincipal UserDetails userDetails) {
        
        List<VocabularyWord> words = vocabularyService.getWordsInList(listId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("words", words);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * 删除单词表
     * Python: DELETE /api/vocabulary/lists/{listId}
     */
    @DeleteMapping("/lists/{listId}")
    public ResponseEntity<MessageResponse> deleteList(
            @PathVariable Integer listId,
            @AuthenticationPrincipal UserDetails userDetails) {
        
        vocabularyService.deleteVocabularyList(listId);
        
        return ResponseEntity.ok(
            MessageResponse.builder()
                .message("单词表已删除")
                .build()
        );
    }
    
    /**
     * 删除单词
     * Python: DELETE /api/vocabulary/words/{wordId}
     */
    @DeleteMapping("/words/{wordId}")
    public ResponseEntity<MessageResponse> deleteWord(
            @PathVariable Integer wordId,
            @AuthenticationPrincipal UserDetails userDetails) {
        
        vocabularyService.deleteWord(wordId);
        
        return ResponseEntity.ok(
            MessageResponse.builder()
                .message("单词已删除")
                .build()
        );
    }
    
    /**
     * 更新单词学习进度
     * Python: POST /api/vocabulary/progress
     */
    @PostMapping("/progress")
    public ResponseEntity<UserWordProgress> updateProgress(
            @Valid @RequestBody UpdateProgressRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        UserWordProgress progress = vocabularyService.updateUserWordProgress(
            userId, request.getWordId(), request.getMasteryLevel(), request.getIsDifficult());
        
        return ResponseEntity.ok(progress);
    }
    
    /**
     * 获取需要复习的单词
     * Python: GET /api/vocabulary/review
     */
    @GetMapping("/review")
    public ResponseEntity<Map<String, Object>> getReviewWords(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        List<UserWordProgress> words = vocabularyService.getUserReviewWords(userId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("words", words);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * 获取学习统计
     * Python: GET /api/vocabulary/stats
     */
    @GetMapping("/stats")
    public ResponseEntity<VocabularyService.LearningStats> getStats(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        VocabularyService.LearningStats stats = vocabularyService.getUserLearningStats(userId);
        
        return ResponseEntity.ok(stats);
    }
    
    /**
     * 记录学习活动
     * Python: POST /api/vocabulary/activity
     */
    @PostMapping("/activity")
    public ResponseEntity<MessageResponse> recordActivity(
            @Valid @RequestBody RecordActivityRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        vocabularyService.recordLearningActivity(
            userId, request.getActivityType(), request.getActivityDetails(), request.getDuration());
        
        return ResponseEntity.ok(
            MessageResponse.builder()
                .message("学习活动已记录")
                .build()
        );
    }
    
    /**
     * 搜索公共词库
     * Python: GET /api/vocabulary/public/search
     */
    @GetMapping("/public/search")
    public ResponseEntity<Map<String, Object>> searchPublicWords(
            @RequestParam(required = false) String keyword,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(defaultValue = "en") String language,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer size) {
        
        String kw = (keyword != null && !keyword.isEmpty()) ? keyword : (q != null ? q : "");
        VocabularyService.PublicSearchResult result = vocabularyService.searchPublicWordsPaged(kw, language, page, size);
        
        Map<String, Object> response = new HashMap<>();
        response.put("words", result.words());
        response.put("total", result.total());
        response.put("page", result.page());
        response.put("size", result.size());
        
        return ResponseEntity.ok(response);
    }

    @GetMapping("/lists/{listId}/progress")
    public ResponseEntity<Map<String, Object>> getListProgress(
            @PathVariable Integer listId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {

        Long userId = customUserDetails.getUser().getId();
        List<UserWordProgress> progress = vocabularyService.getUserProgressForList(userId, listId);

        Map<String, Object> response = new HashMap<>();
        response.put("progress", progress);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/articles/topics")
    public ResponseEntity<List<String>> generateTopics(
            @RequestBody GenerateTopicsRequest request) {
        List<String> topics = vocabularyService.generateArticleTopics(request.getWords(), request.getLanguage());
        return ResponseEntity.ok(topics);
    }

    @PostMapping("/articles/generate")
    public ResponseEntity<GeneratedArticle> generateArticle(
            @RequestBody GenerateArticleRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        GeneratedArticle article = vocabularyService.generateAndSaveArticle(
            userId, request.getListId(), request.getWordIds(), 
            request.getTopic(), request.getDifficulty(), request.getLength(), request.getTargetLanguage());
        return ResponseEntity.ok(article);
    }

    @GetMapping("/articles")
    public ResponseEntity<List<GeneratedArticle>> getUserArticles(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        List<GeneratedArticle> articles = vocabularyService.getUserGeneratedArticles(userId);
        return ResponseEntity.ok(articles);
    }

    @GetMapping("/articles/{articleId}")
    public ResponseEntity<GeneratedArticle> getArticle(
            @PathVariable Integer articleId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        GeneratedArticle article = vocabularyService.getGeneratedArticle(articleId, userId);
        return ResponseEntity.ok(article);
    }

    @PostMapping("/articles/{articleId}/download-pdf")
    public ResponseEntity<byte[]> downloadArticlePdf(
            @PathVariable Integer articleId,
            @Valid @RequestBody GeneratePdfRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        GeneratedArticle article = vocabularyService.getGeneratedArticle(articleId);
        article = vocabularyService.getGeneratedArticle(articleId, userId);

        byte[] pdfBytes = vocabularyService.renderPdfFromHtml(request.getHtml());
        String baseName = request.getFilename();
        if (baseName == null || baseName.isBlank()) {
            baseName = (article.getTopic() == null || article.getTopic().isBlank()) ? "未命名文章" : article.getTopic().trim();
        }
        String encodedFilename = URLEncoder.encode(baseName + "-学习版.pdf", StandardCharsets.UTF_8);

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + encodedFilename + "\"")
                .body(pdfBytes);
    }
}
