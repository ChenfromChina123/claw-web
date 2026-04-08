package com.aispring.common.prompt;

/**
 * 搜索相关提示词常量
 * 统一管理搜索服务中使用的所有提示词
 */
public final class SearchPromptConstants {

    private SearchPromptConstants() {
    }

    /**
     * 语义搜索关键词扩展提示词模板
     * 参数说明: %s - 中文关键词, %d - 最大单词数
     */
    public static final String SEMANTIC_SEARCH_PROMPT_TEMPLATE = """
        你是一个英语教育专家。用户想学习与"%s"相关的英语单词。
        请列出 %d 个最相关、最常用的英语单词（名词、动词、形容词等）。
        要求：
        1. 只返回英语单词，每行一个
        2. 不要包含中文、标点符号或其他解释
        3. 单词应该是基础到中等难度的常用词
        4. 确保单词与主题高度相关
        
        示例格式：
        technology
        computer
        software
        internet
        """;
}
