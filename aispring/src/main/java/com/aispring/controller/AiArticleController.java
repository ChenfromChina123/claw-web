package com.aispring.controller;

import com.aispring.entity.GeneratedArticle;
import com.aispring.security.CustomUserDetails;
import com.aispring.service.VocabularyService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai/article")
@RequiredArgsConstructor
public class AiArticleController {

    private final VocabularyService vocabularyService;

    @Data
    public static class RecommendThemeRequest {
        @NotEmpty(message = "word_list 不能为空")
        private List<String> wordList;
    }

    @Data
    public static class GenerateRequest {
        private Integer listId;
        private List<Integer> wordIds;
        private List<String> wordList;
        @NotBlank(message = "theme 不能为空")
        private String theme;
        @NotBlank(message = "target_language 不能为空")
        private String targetLanguage;
        @NotBlank(message = "length_type 不能为空")
        private String lengthType;
        private String difficulty;
    }

    @Data
    public static class ExportPdfRequest {
        private Integer recordId;
        private String content;
        @NotBlank(message = "theme 不能为空")
        private String theme;
    }

    @Data
    public static class DeleteHistoryRequest {
        @NotEmpty(message = "record_id_list 不能为空")
        private List<Integer> recordIdList;
    }

    @GetMapping("/word-library")
    public ResponseEntity<Map<String, Object>> getWordLibrary(
        @RequestParam(name = "library_type", defaultValue = "mine") String libraryType,
        @RequestParam(name = "keyword", required = false) String keyword,
        @RequestParam(name = "category", required = false) String category,
        @RequestParam(name = "language", required = false) String language,
        @RequestParam(name = "page_num", defaultValue = "1") Integer pageNum,
        @RequestParam(name = "page_size", defaultValue = "20") Integer pageSize,
        @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        Long userId = customUserDetails.getUser().getId();
        VocabularyService.ArticleWordLibraryResult result = vocabularyService.getArticleWordLibrary(
            userId, libraryType, keyword, category, pageNum, pageSize, language
        );
        return ResponseEntity.ok(Map.of(
            "total", result.total(),
            "list", result.list(),
            "page_num", result.pageNum(),
            "page_size", result.pageSize()
        ));
    }

    @PostMapping("/recommend-theme")
    public ResponseEntity<List<String>> recommendTheme(@Valid @RequestBody RecommendThemeRequest request) {
        return ResponseEntity.ok(vocabularyService.generateArticleTopics(request.getWordList(), "auto"));
    }

    @PostMapping("/generate")
    public ResponseEntity<GeneratedArticle> generate(@Valid @RequestBody GenerateRequest request,
                                                     @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        GeneratedArticle article;
        if (request.getWordList() != null && !request.getWordList().isEmpty()) {
            article = vocabularyService.generateAndSaveArticleByWordTexts(
                userId,
                request.getListId(),
                request.getWordIds(),
                request.getWordList(),
                request.getTheme(),
                request.getDifficulty(),
                request.getLengthType(),
                request.getTargetLanguage()
            );
        } else {
            article = vocabularyService.generateAndSaveArticle(
                userId,
                request.getListId(),
                request.getWordIds(),
                request.getTheme(),
                request.getDifficulty(),
                request.getLengthType(),
                request.getTargetLanguage()
            );
        }
        return ResponseEntity.ok(article);
    }

    @GetMapping("/history-list")
    public ResponseEntity<Map<String, Object>> historyList(
        @RequestParam(name = "keyword", required = false) String keyword,
        @RequestParam(name = "target_language", required = false) String targetLanguage,
        @RequestParam(name = "start_time", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate startTime,
        @RequestParam(name = "end_time", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endTime,
        @RequestParam(name = "page_num", defaultValue = "1") Integer pageNum,
        @RequestParam(name = "page_size", defaultValue = "10") Integer pageSize,
        @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        Long userId = customUserDetails.getUser().getId();
        LocalDateTime start = startTime == null ? null : startTime.atStartOfDay();
        LocalDateTime end = endTime == null ? null : endTime.plusDays(1).atStartOfDay().minusSeconds(1);
        VocabularyService.ArticleHistoryResult result = vocabularyService.getUserGeneratedArticles(
            userId, keyword, targetLanguage, start, end, pageNum, pageSize
        );
        return ResponseEntity.ok(Map.of(
            "total", result.total(),
            "list", result.list(),
            "page_num", result.pageNum(),
            "page_size", result.pageSize()
        ));
    }

    @GetMapping("/history-detail")
    public ResponseEntity<GeneratedArticle> historyDetail(
        @RequestParam(name = "record_id") Integer recordId,
        @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        Long userId = customUserDetails.getUser().getId();
        return ResponseEntity.ok(vocabularyService.getGeneratedArticle(recordId, userId));
    }

    @PostMapping("/export-pdf")
    public ResponseEntity<byte[]> exportPdf(@Valid @RequestBody ExportPdfRequest request,
                                            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        String html = request.getContent();
        if ((html == null || html.isBlank()) && request.getRecordId() != null) {
            GeneratedArticle article = vocabularyService.getGeneratedArticle(request.getRecordId(), userId);
            html = article.getOriginalText();
        }
        byte[] pdfBytes = vocabularyService.renderPdfFromHtml(html);
        String encodedFilename = URLEncoder.encode(request.getTheme().trim() + "_" + System.currentTimeMillis() + ".pdf", StandardCharsets.UTF_8);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + encodedFilename + "\"")
            .body(pdfBytes);
    }

    @PostMapping("/delete-history")
    public ResponseEntity<Map<String, Object>> deleteHistory(@Valid @RequestBody DeleteHistoryRequest request,
                                                             @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        int deletedCount = vocabularyService.deleteUserGeneratedArticles(userId, request.getRecordIdList());
        return ResponseEntity.ok(Map.of("success", true, "deleted_count", deletedCount));
    }

    @PostMapping("/clear-history")
    public ResponseEntity<Map<String, Object>> clearHistory(@AuthenticationPrincipal CustomUserDetails customUserDetails) {
        Long userId = customUserDetails.getUser().getId();
        int deletedCount = vocabularyService.clearUserGeneratedArticles(userId);
        return ResponseEntity.ok(Map.of("success", true, "deleted_count", deletedCount));
    }
}
