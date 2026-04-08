package com.aispring.service;

import com.aispring.entity.PracticeRecord;
import com.aispring.entity.PronunciationRecord;
import com.aispring.entity.UserWordProgress;
import com.aispring.repository.PracticeRecordRepository;
import com.aispring.repository.PronunciationRecordRepository;
import com.aispring.repository.UserWordProgressRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 学习记录服务
 * 负责记录和管理用户的发音、练习等学习行为
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LearningRecordService {
    
    private final PronunciationRecordRepository pronunciationRecordRepository;
    private final PracticeRecordRepository practiceRecordRepository;
    private final UserWordProgressRepository userWordProgressRepository;
    private final ObjectMapper objectMapper;
    
    /**
     * 记录发音练习
     */
    @Transactional
    public PronunciationRecord recordPronunciation(Long userId, Integer wordId, 
                                                    String targetText, String recognizedText,
                                                    Integer score, String aiFeedback, 
                                                    List<String> weakWords) {
        try {
            String weakWordsJson = weakWords != null ? objectMapper.writeValueAsString(weakWords) : null;
            
            PronunciationRecord record = PronunciationRecord.builder()
                .userId(userId)
                .wordId(wordId)
                .targetText(targetText)
                .recognizedText(recognizedText)
                .score(score)
                .aiFeedback(aiFeedback)
                .weakWords(weakWordsJson)
                .practiceMode("pronunciation")
                .build();
            
            record = pronunciationRecordRepository.save(record);
            
            updateWordProgressAfterPronunciation(userId, wordId, score, record.getCreatedAt());
            
            log.info("记录发音练习 - 用户：{}, 单词 ID: {}, 得分：{}", userId, wordId, score);
            
            return record;
        } catch (Exception e) {
            log.error("记录发音练习失败", e);
            throw new RuntimeException("记录发音练习失败", e);
        }
    }
    
    /**
     * 记录拼写练习
     */
    @Transactional
    public PracticeRecord recordSpelling(Long userId, Integer wordId, 
                                          String userInput, String correctAnswer,
                                          Boolean isCorrect, Integer score,
                                          Long responseTime, String aiFeedback) {
        try {
            PracticeRecord record = PracticeRecord.builder()
                .userId(userId)
                .wordId(wordId)
                .practiceType("spelling")
                .userInput(userInput)
                .correctAnswer(correctAnswer)
                .isCorrect(isCorrect)
                .score(score)
                .responseTime(responseTime)
                .aiFeedback(aiFeedback)
                .build();
            
            record = practiceRecordRepository.save(record);
            
            updateWordProgressAfterSpelling(userId, wordId, isCorrect, score, record.getCreatedAt());
            
            log.info("记录拼写练习 - 用户：{}, 单词 ID: {}, 是否正确：{}, 得分：{}", 
                     userId, wordId, isCorrect, score);
            
            return record;
        } catch (Exception e) {
            log.error("记录拼写练习失败", e);
            throw new RuntimeException("记录拼写练习失败", e);
        }
    }
    
    /**
     * 记录复习练习
     */
    @Transactional
    public PracticeRecord recordReview(Long userId, Integer wordId,
                                        String practiceDetails) {
        try {
            PracticeRecord record = PracticeRecord.builder()
                .userId(userId)
                .wordId(wordId)
                .practiceType("review")
                .practiceDetails(practiceDetails)
                .isCorrect(true)
                .score(100)
                .build();
            
            record = practiceRecordRepository.save(record);
            
            updateWordProgressAfterReview(userId, wordId, record.getCreatedAt());
            
            log.info("记录复习练习 - 用户：{}, 单词 ID: {}", userId, wordId);
            
            return record;
        } catch (Exception e) {
            log.error("记录复习练习失败", e);
            throw new RuntimeException("记录复习练习失败", e);
        }
    }
    
    /**
     * 更新单词进度（发音练习后）
     */
    private void updateWordProgressAfterPronunciation(Long userId, Integer wordId, 
                                                       Integer score, LocalDateTime practiceTime) {
        UserWordProgress progress = getOrCreateProgress(userId, wordId);
        
        progress.setPronunciationCount(progress.getPronunciationCount() + 1);
        progress.setLastPronunciationTime(practiceTime);
        
        if (progress.getPronunciationBestScore() == null || score > progress.getPronunciationBestScore()) {
            progress.setPronunciationBestScore(score);
        }
        
        Double currentAvg = progress.getPronunciationAvgScore();
        Integer count = progress.getPronunciationCount();
        if (currentAvg != null) {
            Double newAvg = ((currentAvg * (count - 1)) + score) / count;
            progress.setPronunciationAvgScore(newAvg);
        } else {
            progress.setPronunciationAvgScore((double) score);
        }
        
        progress.setTotalPracticeCount(progress.getTotalPracticeCount() + 1);
        
        if (progress.getStatus() == 0) {
            progress.setStatus(1);
        }
        
        userWordProgressRepository.save(progress);
    }
    
    /**
     * 更新单词进度（拼写练习后）
     */
    private void updateWordProgressAfterSpelling(Long userId, Integer wordId, 
                                                  Boolean isCorrect, Integer score, 
                                                  LocalDateTime practiceTime) {
        UserWordProgress progress = getOrCreateProgress(userId, wordId);
        
        progress.setSpellingCount(progress.getSpellingCount() + 1);
        progress.setLastSpellingTime(practiceTime);
        
        if (isCorrect) {
            progress.setSpellingCorrectCount(progress.getSpellingCorrectCount() + 1);
        } else {
            progress.setErrorCount(progress.getErrorCount() + 1);
        }
        
        progress.setTotalPracticeCount(progress.getTotalPracticeCount() + 1);
        
        if (progress.getStatus() == 0) {
            progress.setStatus(1);
        }
        
        userWordProgressRepository.save(progress);
    }
    
    /**
     * 更新单词进度（复习后）
     */
    private void updateWordProgressAfterReview(Long userId, Integer wordId, LocalDateTime practiceTime) {
        UserWordProgress progress = getOrCreateProgress(userId, wordId);
        
        progress.setReviewCount(progress.getReviewCount() + 1);
        progress.setLastReviewed(practiceTime);
        progress.setTotalPracticeCount(progress.getTotalPracticeCount() + 1);
        
        if (progress.getStatus() == 0) {
            progress.setStatus(1);
        }
        
        userWordProgressRepository.save(progress);
    }
    
    /**
     * 获取或创建单词进度
     */
    private UserWordProgress getOrCreateProgress(Long userId, Integer wordId) {
        return userWordProgressRepository.findByUserIdAndWordId(userId, wordId)
            .orElseGet(() -> {
                UserWordProgress progress = UserWordProgress.builder()
                    .userId(userId)
                    .wordId(wordId)
                    .status(0)
                    .errorCount(0)
                    .pronunciationCount(0)
                    .spellingCount(0)
                    .totalPracticeCount(0)
                    .build();
                return userWordProgressRepository.save(progress);
            });
    }
    
    /**
     * 获取用户的发音记录
     */
    public List<PronunciationRecord> getUserPronunciationRecords(Long userId, Integer wordId) {
        if (wordId != null) {
            return pronunciationRecordRepository.findByUserIdAndWordIdOrderByCreatedAtDesc(userId, wordId);
        }
        return pronunciationRecordRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }
    
    /**
     * 获取用户的练习记录
     */
    public List<PracticeRecord> getUserPracticeRecords(Long userId, Integer wordId) {
        if (wordId != null) {
            return practiceRecordRepository.findByUserIdAndWordIdOrderByCreatedAtDesc(userId, wordId);
        }
        return practiceRecordRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }
    
    /**
     * 获取用户的学习统计
     */
    public Map<String, Object> getLearningStatistics(Long userId) {
        Map<String, Object> stats = new HashMap<>();
        
        Long totalPronunciation = pronunciationRecordRepository.countByUserId(userId);
        Long totalPractice = practiceRecordRepository.countByUserId(userId);
        Double pronunciationAvgScore = pronunciationRecordRepository.getAverageScore(userId);
        Integer pronunciationBestScore = pronunciationRecordRepository.getBestScore(userId);
        Double practiceAccuracy = practiceRecordRepository.getAccuracyRate(userId);
        Long todayPronunciation = pronunciationRecordRepository.countTodayByUserId(userId);
        Long todayPractice = practiceRecordRepository.countTodayByUserId(userId);
        
        stats.put("totalPronunciation", totalPronunciation);
        stats.put("totalPractice", totalPractice);
        stats.put("pronunciationAvgScore", pronunciationAvgScore);
        stats.put("pronunciationBestScore", pronunciationBestScore);
        stats.put("practiceAccuracy", practiceAccuracy);
        stats.put("todayPronunciation", todayPronunciation);
        stats.put("todayPractice", todayPractice);
        
        return stats;
    }
}
