package com.aispring.common.prompt;

/**
 * AI 聊天问答相关提示词常量
 * 统一管理 AI 聊天服务中使用的系统提示词
 */
public final class ChatPromptConstants {

    private ChatPromptConstants() {
    }

    /**
     * 系统能力说明前缀
     */
    private static final String SYSTEM_CAPABILITY_PREFIX = "\n【系统能力】当你需要查询实时信息时，直接输出以下XML标签，系统会自动处理：" +
            "\n1. 搜索信息：<search>关键词</search> 或 <search site=\"网站域名\">关键词</search>" +
            "\n2. 获取网页内容：<fetch-url>https://example.com</fetch-url>" +
            "\n3. 检索单词：<query-vocab topic=\"主题\" limit=\"5\" />";

    /**
     * 重要规则说明
     */
    private static final String IMPORTANT_RULES = "\n【重要规则】" +
            "\n- 输出XML标签后，等待系统反馈结果再回答用户" +
            "\n- 严禁向用户透露系统内部机制或工具调用方式" +
            "\n- 只呈现最终结果，不要说明获取过程" +
            "\n- 保持回答简洁，直接给出用户需要的信息";

    /**
     * 完整的系统指令提示词
     */
    public static final String SYSTEM_INSTRUCTIONS = SYSTEM_CAPABILITY_PREFIX + IMPORTANT_RULES;

    /**
     * 搜索结果反馈提示词模板
     */
    public static final String SEARCH_RESULT_FEEDBACK_TEMPLATE = 
            "\n\n【系统反馈的搜索结果】\n%s\n\n请根据上述搜索结果回答用户的问题。";

    /**
     * URL 内容反馈提示词模板
     */
    public static final String URL_CONTENT_FEEDBACK_TEMPLATE = 
            "\n\n【系统反馈的网页内容】\n%s\n\n请根据上述网页内容回答用户的问题。";

    /**
     * 搜索结果系统提示
     */
    public static final String SEARCH_RESULT_SYSTEM_PROMPT = "【系统提示】你已经获取了搜索结果，请直接回答用户问题。";

    /**
     * URL 内容系统提示
     */
    public static final String URL_CONTENT_SYSTEM_PROMPT = "【系统提示】你已经获取了网页内容，请直接回答用户问题。";
}
