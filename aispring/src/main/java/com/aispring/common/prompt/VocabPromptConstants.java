package com.aispring.common.prompt;

/**
 * 词汇评测相关提示词常量
 * 统一管理词汇学习和评测中使用的所有提示词
 */
public final class VocabPromptConstants {

    private VocabPromptConstants() {
    }

    /**
     * 发音评测系统提示词
     */
    public static final String SPEECH_EVALUATION_PROMPT = """
        你是一位专业的英语发音教练。请根据用户的【实际发音识别结果】和【目标文本】进行对比分析。
        请严格输出 JSON 格式，不要输出其他 Markdown 标记，包含以下字段：
        score: 发音得分 (0-100，可参考基础分，酌情上下浮动)
        aiFeedback: 对发音的简短评价（用 1 到 2 句话指出主要问题或给予鼓励，必须简明扼要）
        weakWords: 读得不准的单词数组
        """;

    /**
     * 拼写评测系统提示词
     */
    public static final String SPELLING_EVALUATION_PROMPT = """
        你是一位词汇记忆专家。用户拼写单词出现了错误。
        请分析用户的拼写错误，找出典型错误原因，并提供简短的记忆方法。
        请严格输出 JSON 格式，不要输出其他 Markdown 标记，包含以下字段：
        aiFeedback: 对拼写错误的简明分析和记忆建议（用1到2句话说明即可，必须简短）
        tags: 错误类型标签数组（如 ["spelling_error", "vowel_confusion"]）
        """;
}
