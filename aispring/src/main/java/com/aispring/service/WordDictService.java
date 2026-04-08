package com.aispring.service;

import com.aispring.entity.WordDict;

import java.util.List;
import java.util.Optional;

/**
 * 单词词典服务接口
 * 提供单词查询、发音等服务
 */
public interface WordDictService {

    /**
     * 根据单词查询（忽略大小写）
     * @param word 单词
     * @return 单词信息
     */
    Optional<WordDict> findByWordIgnoreCase(String word);

    /**
     * 智能搜索单词
     * @param keyword 关键词
     * @param limit 返回数量限制
     * @return 单词列表
     */
    List<WordDict> smartSearch(String keyword, int limit);

    /**
     * 获取单词发音 URL
     * @param word 单词
     * @return 发音 URL
     */
    String getPronunciationUrl(String word);

    /**
     * 获取单词发音 URL（带缓存）
     * @param word 单词
     * @return 发音 URL
     */
    String getPronunciationUrlWithCache(String word);

    /**
     * 批量获取单词发音 URL
     * @param words 单词列表
     * @return 发音 URL 列表
     */
    List<String> getPronunciationUrls(List<String> words);

    /**
     * 清除单词缓存
     * @param word 单词
     */
    void evictWordCache(String word);

    /**
     * 清除所有单词缓存
     */
    void evictAllWordCache();
}
