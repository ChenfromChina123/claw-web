package com.aispring.service;

import org.springframework.web.multipart.MultipartFile;
import java.util.Map;

/**
 * AI 单词练习服务接口
 */
public interface AiVocabService {

    /**
     * 评测发音
     * @param audio 音频文件
     * @param targetText 目标文本
     * @param userId 用户ID
     * @return 评测结果
     */
    Map<String, Object> evaluateSpeech(MultipartFile audio, String targetText, Long userId);

    /**
     * 评测拼写
     * @param targetWord 目标单词
     * @param userSpelling 用户拼写
     * @param userId 用户ID
     * @return 评测结果
     */
    Map<String, Object> evaluateSpelling(String targetWord, String userSpelling, Long userId);
}
