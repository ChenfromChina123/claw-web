package com.aispring.service.impl;

import com.aispring.common.prompt.TranslationPromptConstants;
import com.aispring.dto.request.TranslationRequest;
import com.aispring.service.AiChatService;
import com.aispring.service.TranslationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 翻译服务实现类
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TranslationServiceImpl implements TranslationService {

    private final AiChatService aiChatService;

    /**
     * 翻译文本
     * 
     * @param request 翻译请求
     * @return 翻译后的文本
     */
    @Override
    public String translate(TranslationRequest request) {
        // 设置默认目标语言
        String targetLang = request.getTargetLanguage();
        if (targetLang == null || targetLang.trim().isEmpty()) {
            targetLang = "English";
        }

        log.info("开始翻译文本: targetLanguage={}, text={}", targetLang, 
                request.getText().length() > 20 ? request.getText().substring(0, 20) + "..." : request.getText());

        // 构建系统提示词和用户提示词
        String sourceLangInfo = (request.getSourceLanguage() != null && !request.getSourceLanguage().isEmpty()) 
                ? " from " + request.getSourceLanguage() 
                : "";
        
        String userPrompt = String.format(
                TranslationPromptConstants.TRANSLATION_USER_PROMPT_TEMPLATE,
                sourceLangInfo, targetLang, request.getText()
        );
        
        // 使用系统提示词进行翻译
        try {
            // 使用 ask(prompt, sessionId, model, userId, systemPrompt) 方法
            String translatedText = aiChatService.ask(userPrompt, null, null, null, TranslationPromptConstants.TRANSLATION_SYSTEM_PROMPT);
            return translatedText != null ? translatedText.trim() : "";
        } catch (Exception e) {
            log.error("翻译过程中出现错误: ", e);
            throw new RuntimeException("翻译失败: " + e.getMessage());
        }
    }
}
