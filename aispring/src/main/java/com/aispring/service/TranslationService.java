package com.aispring.service;

import com.aispring.dto.request.TranslationRequest;

/**
 * 翻译服务接口
 */
public interface TranslationService {
    
    /**
     * 翻译文本
     * 
     * @param request 翻译请求
     * @return 翻译后的文本
     */
    String translate(TranslationRequest request);
}
