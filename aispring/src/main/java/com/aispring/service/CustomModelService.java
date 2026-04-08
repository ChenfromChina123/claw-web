package com.aispring.service;

import com.aispring.entity.CustomModel;
import com.aispring.repository.CustomModelRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 自定义模型服务
 */
@Service
@RequiredArgsConstructor
public class CustomModelService {
    
    private final CustomModelRepository customModelRepository;
    
    /**
     * 创建自定义模型
     */
    @Transactional
    public CustomModel createCustomModel(Long userId, String name, String apiKey, 
                                        String baseUrl, String modelName, String description) {
        CustomModel model = CustomModel.builder()
            .userId(userId)
            .name(name)
            .apiKey(apiKey)
            .baseUrl(baseUrl)
            .modelName(modelName)
            .description(description)
            .isActive(true)
            .build();
        
        return customModelRepository.save(model);
    }
    
    /**
     * 获取用户的所有自定义模型
     */
    public List<CustomModel> getUserCustomModels(Long userId) {
        return customModelRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }
    
    /**
     * 根据ID获取模型
     */
    public CustomModel getModelById(Long userId, Long modelId) {
        return customModelRepository.findByIdAndUserId(modelId, userId)
            .orElseThrow(() -> new IllegalArgumentException("模型不存在"));
    }
    
    /**
     * 更新自定义模型
     */
    @Transactional
    public CustomModel updateCustomModel(Long userId, Long modelId, String name, String apiKey,
                                        String baseUrl, String modelName, String description, Boolean isActive) {
        CustomModel model = getModelById(userId, modelId);
        
        if (name != null) model.setName(name);
        if (apiKey != null) model.setApiKey(apiKey);
        if (baseUrl != null) model.setBaseUrl(baseUrl);
        if (modelName != null) model.setModelName(modelName);
        if (description != null) model.setDescription(description);
        if (isActive != null) model.setIsActive(isActive);
        
        return customModelRepository.save(model);
    }
    
    /**
     * 删除自定义模型
     */
    @Transactional
    public void deleteCustomModel(Long userId, Long modelId) {
        CustomModel model = getModelById(userId, modelId);
        customModelRepository.delete(model);
    }
}

