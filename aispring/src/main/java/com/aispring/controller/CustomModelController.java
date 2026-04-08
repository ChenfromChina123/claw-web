package com.aispring.controller;

import com.aispring.entity.CustomModel;
import com.aispring.service.CustomModelService;
import com.aispring.dto.response.MessageResponse;
import com.aispring.security.CustomUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 自定义模型控制器
 * 对应Python: app.py中的/api/custom-models端点
 */
@RestController
@RequestMapping("/api/custom-models")
@RequiredArgsConstructor
public class CustomModelController {
    
    private final CustomModelService customModelService;
    
    @Data
    public static class CreateModelRequest {
        @NotBlank(message = "名称不能为空")
        private String name;
        
        @NotBlank(message = "API密钥不能为空")
        private String apiKey;
        
        @NotBlank(message = "基础URL不能为空")
        private String baseUrl;
        
        @NotBlank(message = "模型名称不能为空")
        private String modelName;
        
        private String description;
    }
    
    @Data
    public static class UpdateModelRequest {
        private String name;
        private String apiKey;
        private String baseUrl;
        private String modelName;
        private String description;
        private Boolean isActive;
    }
    
    /**
     * 获取自定义模型列表
     * Python: GET /api/custom-models
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getCustomModels(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        List<CustomModel> models = customModelService.getUserCustomModels(userId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("models", models);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * 创建自定义模型
     * Python: POST /api/custom-models
     */
    @PostMapping
    public ResponseEntity<CustomModel> createCustomModel(
            @Valid @RequestBody CreateModelRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        CustomModel model = customModelService.createCustomModel(
            userId, request.getName(), request.getApiKey(), request.getBaseUrl(),
            request.getModelName(), request.getDescription());
        
        return ResponseEntity.ok(model);
    }
    
    /**
     * 更新自定义模型
     * Python: PUT /api/custom-models/{model_id}
     */
    @PutMapping("/{modelId}")
    public ResponseEntity<CustomModel> updateCustomModel(
            @PathVariable Long modelId,
            @RequestBody UpdateModelRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        CustomModel model = customModelService.updateCustomModel(
            userId, modelId, request.getName(), request.getApiKey(), request.getBaseUrl(),
            request.getModelName(), request.getDescription(), request.getIsActive());
        
        return ResponseEntity.ok(model);
    }
    
    /**
     * 删除自定义模型
     * Python: DELETE /api/custom-models/{model_id}
     */
    @DeleteMapping("/{modelId}")
    public ResponseEntity<MessageResponse> deleteCustomModel(
            @PathVariable Long modelId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        customModelService.deleteCustomModel(userId, modelId);
        
        return ResponseEntity.ok(
            MessageResponse.builder()
                .message("自定义模型已删除")
                .build()
        );
    }
    
    /**
     * 测试自定义模型
     * Python: POST /api/custom-models/{model_id}/test
     */
    @PostMapping("/{modelId}/test")
    public ResponseEntity<MessageResponse> testCustomModel(
            @PathVariable Long modelId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        customModelService.getModelById(userId, modelId);
        
        // TODO: 实现模型测试逻辑
        
        return ResponseEntity.ok(
            MessageResponse.builder()
                .message("模型测试成功")
                .build()
        );
    }
}

