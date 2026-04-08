package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.service.AiVocabService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * AI 单词练习评测控制器
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@Slf4j
public class AiVocabController {

    private final AiVocabService aiVocabService;

    /**
     * 发音评测接口
     * @param audio 音频文件
     * @param targetText 目标单词/句子
     * @param userId 用户ID (可选)
     * @return 评测结果
     */
    @PostMapping("/speech/evaluate")
    public ApiResponse<Map<String, Object>> evaluateSpeech(
            @RequestParam("audio") MultipartFile audio,
            @RequestParam("targetText") String targetText,
            @RequestParam(value = "userId", required = false) Long userId) {
        log.info("Received speech evaluation request for target: {}", targetText);
        try {
            Map<String, Object> result = aiVocabService.evaluateSpeech(audio, targetText, userId);
            return ApiResponse.success("评测成功", result);
        } catch (Exception e) {
            log.error("Speech evaluation failed", e);
            return ApiResponse.error(500, "发音评测失败: " + e.getMessage());
        }
    }

    @Data
    public static class SpellingEvaluateRequest {
        @com.fasterxml.jackson.annotation.JsonProperty("targetWord")
        private String targetWord;
        @com.fasterxml.jackson.annotation.JsonProperty("userSpelling")
        private String userSpelling;
        private Long userId;
    }

    /**
     * 拼写错误分析接口
     * @param request 拼写信息
     * @return 评测结果
     */
    @PostMapping("/spelling/evaluate")
    public ApiResponse<Map<String, Object>> evaluateSpelling(@RequestBody SpellingEvaluateRequest request) {
        log.info("Received spelling evaluation request for target: {}, userSpelling: {}", request.getTargetWord(), request.getUserSpelling());
        try {
            Map<String, Object> result = aiVocabService.evaluateSpelling(request.getTargetWord(), request.getUserSpelling(), request.getUserId());
            return ApiResponse.success("分析成功", result);
        } catch (Exception e) {
            log.error("Spelling evaluation failed", e);
            return ApiResponse.error(500, "拼写分析失败: " + e.getMessage());
        }
    }
}
