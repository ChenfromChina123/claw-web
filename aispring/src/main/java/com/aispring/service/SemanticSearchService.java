package com.aispring.service;

import com.aispring.entity.WordDict;
import java.util.List;

/**
 * 语义搜索服务接口
 * 使用 AI 将用户意图转换为相关英文单词，实现智能搜索
 */
public interface SemanticSearchService {

    /**
     * 语义搜索单词
     * 将中文关键词转换为相关英文单词，从词库中检索
     *
     * @param chineseKeyword 中文关键词（如"科技"、"医疗"、"环境"）
     * @param limit 返回数量限制
     * @return 相关单词列表
     */
    List<WordDict> semanticSearch(String chineseKeyword, int limit);

    /**
     * 使用 AI 扩展关键词
     * 将中文关键词转换为相关的英文单词列表
     *
     * @param chineseKeyword 中文关键词
     * @param maxWords 最大返回单词数
     * @return 英文单词列表
     */
    List<String> expandKeywordsWithAI(String chineseKeyword, int maxWords);

    /**
     * 智能搜索单词
     * 支持英文精确匹配、前缀匹配和中文翻译匹配
     *
     * @param keyword 搜索关键词（英文或中文）
     * @param limit 返回数量限制
     * @return 匹配的单词列表
     */
    List<WordDict> smartSearch(String keyword, int limit);
}
