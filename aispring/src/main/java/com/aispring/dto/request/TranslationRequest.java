package com.aispring.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 翻译请求 DTO
 */
@Data
public class TranslationRequest {
    
    /**
     * 需要翻译的文本
     */
    @NotBlank(message = "待翻译文本不能为空")
    private String text;
    
    /**
     * 目标语言 (如: English, Chinese, Japanese, etc.)
     */
    private String targetLanguage;

    /**
     * 源语言 (可选，默认自动检测)
     */
    private String sourceLanguage;
}
