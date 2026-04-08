package com.aispring.common.prompt;

/**
 * 翻译相关提示词常量
 * 统一管理翻译服务中使用的所有提示词
 */
public final class TranslationPromptConstants {

    private TranslationPromptConstants() {
    }

    /**
     * 翻译系统提示词
     */
    public static final String TRANSLATION_SYSTEM_PROMPT =
            "You are a professional translator. Your task is to translate text accurately while maintaining the original meaning and tone.";

    /**
     * 翻译用户提示词模板
     * 参数说明: %s - 源语言信息, %s - 目标语言, %s - 待翻译文本
     */
    public static final String TRANSLATION_USER_PROMPT_TEMPLATE =
            "Please translate the following text%s to %s.\n" +
            "Only provide the translated text, no explanations or additional content.\n\n" +
            "Text to translate:\n%s";
}
