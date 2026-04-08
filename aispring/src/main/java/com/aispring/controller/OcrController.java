package com.aispring.controller;

import java.io.IOException;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.aispring.service.OcrService;

/**
 * OCR控制器
 * 处理文字识别相关的HTTP请求
 * 所有接口需要用户认证后才能访问
 */
@RestController
@RequestMapping("/api/ocr")
public class OcrController {

    @Autowired
    private OcrService ocrService;

    /**
     * 健康检查接口
     * 需要认证才能访问
     *
     * @return 服务状态
     */
    @GetMapping("/health")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        boolean isAvailable = ocrService.isAvailable();
        Map<String, Object> response = Map.of(
                "status", isAvailable ? "healthy" : "unavailable",
                "service", "ocr-service",
                "version", "1.0.0",
                "available", isAvailable,
                "provider", "阿里云 OCR 服务"
        );
        return ResponseEntity.ok(response);
    }

    /**
     * 识别图像中的文字
     * 需要认证才能访问
     *
     * @param file 图像文件
     * @return 识别结果
     */
    @PostMapping("/recognize")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> recognizeText(@RequestParam("image") MultipartFile file) {
        try {
            Map<String, Object> result = ocrService.recognizeText(file);
            if ((boolean) result.getOrDefault("success", false)) {
                return ResponseEntity.ok(result);
            } else {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(result);
            }
        } catch (IOException e) {
            Map<String, Object> errorResult = Map.of(
                    "success", false,
                    "error", e.getMessage()
            );
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResult);
        }
    }

    /**
     * 识别Base64编码的图像中的文字
     * 需要认证才能访问
     *
     * @param request 请求体，包含Base64编码的图像数据
     * @return 识别结果
     */
    @PostMapping("/recognize/base64")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> recognizeTextFromBase64(@RequestBody Map<String, String> request) {
        try {
            String base64Image = request.get("image");
            if (base64Image == null) {
                Map<String, Object> errorResult = Map.of(
                        "success", false,
                        "error", "请求体需要包含 'image' 字段"
                );
                return ResponseEntity.badRequest().body(errorResult);
            }

            Map<String, Object> result = ocrService.recognizeTextFromBase64(base64Image);
            if ((boolean) result.getOrDefault("success", false)) {
                return ResponseEntity.ok(result);
            } else {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(result);
            }
        } catch (IOException e) {
            Map<String, Object> errorResult = Map.of(
                    "success", false,
                    "error", e.getMessage()
            );
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResult);
        }
    }
}
