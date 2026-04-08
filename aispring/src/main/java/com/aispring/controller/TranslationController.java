package com.aispring.controller;

import com.aispring.dto.request.TranslationRequest;
import com.aispring.dto.response.ApiResponse;
import com.aispring.service.TranslationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 翻译控制器
 */
@RestController
@RequestMapping("/api/translation")
@RequiredArgsConstructor
public class TranslationController {

    private final TranslationService translationService;

    /**
     * 翻译文本接口
     * 
     * @param request 翻译请求
     * @return 翻译后的文本结果
     */
    @PostMapping("/translate")
    public ResponseEntity<ApiResponse<String>> translate(@RequestBody TranslationRequest request) {
        String result = translationService.translate(request);
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
