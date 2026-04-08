package com.aispring.controller;

import com.aispring.entity.PracticeRecord;
import com.aispring.entity.PronunciationRecord;
import com.aispring.service.LearningRecordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import com.aispring.security.CustomUserDetails;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 学习记录查询控制器
 * 提供用户发音记录和练习记录的查询功能
 */
@RestController
@RequestMapping("/api/learning")
@RequiredArgsConstructor
@Slf4j
public class LearningRecordController {
    
    private final LearningRecordService learningRecordService;
    
    /**
     * 获取用户的发音记录
     * GET /api/learning/pronunciation
     */
    @GetMapping("/pronunciation")
    public ResponseEntity<Map<String, Object>> getPronunciationRecords(
            @RequestParam(required = false) Integer wordId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        List<PronunciationRecord> records;
        
        if (startTime != null && endTime != null) {
            records = learningRecordService.getUserPronunciationRecords(userId, null);
            records = records.stream()
                .filter(r -> !r.getCreatedAt().isBefore(startTime) && !r.getCreatedAt().isAfter(endTime))
                .toList();
        } else if (wordId != null) {
            records = learningRecordService.getUserPronunciationRecords(userId, wordId);
        } else {
            records = learningRecordService.getUserPronunciationRecords(userId, null);
        }
        
        Map<String, Object> response = new HashMap<>();
        response.put("records", records);
        response.put("total", records.size());
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * 获取用户的练习记录
     * GET /api/learning/practice
     */
    @GetMapping("/practice")
    public ResponseEntity<Map<String, Object>> getPracticeRecords(
            @RequestParam(required = false) Integer wordId,
            @RequestParam(required = false) String practiceType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        List<PracticeRecord> records;
        
        if (startTime != null && endTime != null) {
            records = learningRecordService.getUserPracticeRecords(userId, null);
            records = records.stream()
                .filter(r -> !r.getCreatedAt().isBefore(startTime) && !r.getCreatedAt().isAfter(endTime))
                .toList();
        } else if (wordId != null) {
            records = learningRecordService.getUserPracticeRecords(userId, wordId);
        } else {
            records = learningRecordService.getUserPracticeRecords(userId, null);
        }
        
        if (practiceType != null && !practiceType.isEmpty()) {
            records = records.stream()
                .filter(r -> practiceType.equals(r.getPracticeType()))
                .toList();
        }
        
        Map<String, Object> response = new HashMap<>();
        response.put("records", records);
        response.put("total", records.size());
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * 获取用户的学习统计
     * GET /api/learning/statistics
     */
    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getLearningStatistics(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        Map<String, Object> stats = learningRecordService.getLearningStatistics(userId);
        
        return ResponseEntity.ok(stats);
    }
    
    /**
     * 获取指定单词的学习历史
     * GET /api/learning/word/{wordId}/history
     */
    @GetMapping("/word/{wordId}/history")
    public ResponseEntity<Map<String, Object>> getWordLearningHistory(
            @PathVariable Integer wordId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        
        List<PronunciationRecord> pronunciationRecords = 
            learningRecordService.getUserPronunciationRecords(userId, wordId);
        List<PracticeRecord> practiceRecords = 
            learningRecordService.getUserPracticeRecords(userId, wordId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("wordId", wordId);
        response.put("pronunciationRecords", pronunciationRecords);
        response.put("practiceRecords", practiceRecords);
        response.put("totalPronunciation", pronunciationRecords.size());
        response.put("totalPractice", practiceRecords.size());
        
        return ResponseEntity.ok(response);
    }
}
