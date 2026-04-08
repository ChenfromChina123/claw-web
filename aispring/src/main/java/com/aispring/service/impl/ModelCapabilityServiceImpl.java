package com.aispring.service.impl;

import com.aispring.entity.ai.ChatMode;
import com.aispring.entity.ai.FeatureName;
import com.aispring.entity.ai.ModelCapability;
import com.aispring.service.ModelCapabilityService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 模型能力服务实现（参考 void-main 的 modelCapabilities.ts）
 * 
 * @author AISpring Team
 * @since 2025-12-23
 */
@Service
@Slf4j
public class ModelCapabilityServiceImpl implements ModelCapabilityService {
    
    private final Map<String, ModelCapability> capabilityCache = new ConcurrentHashMap<>();
    
    public ModelCapabilityServiceImpl() {
        initializeDefaultCapabilities();
    }
    
    /**
     * 初始化默认模型能力配置
     */
    private void initializeDefaultCapabilities() {
        // DeepSeek 模型（阿里百炼API格式）
        capabilityCache.put("deepseek:deepseek-v3", ModelCapability.deepseekChat());
        capabilityCache.put("deepseek:deepseek-r1", ModelCapability.deepseekReasoner());
        capabilityCache.put("deepseek:deepseek-coder", ModelCapability.deepseekChat());
        
        // 兼容旧名称
        capabilityCache.put("deepseek:deepseek-chat", ModelCapability.deepseekChat());
        capabilityCache.put("deepseek:deepseek-reasoner", ModelCapability.deepseekReasoner());
        
        // Doubao 模型（假设与 DeepSeek 类似）
        capabilityCache.put("doubao:doubao-pro-32k", ModelCapability.deepseekChat());
        capabilityCache.put("doubao:doubao-seed-1-6-251015", ModelCapability.deepseekReasoner());
        
        // 默认配置（用于未知模型）
        capabilityCache.put("default:default", ModelCapability.defaultCapability());
    }
    
    @Override
    public ModelCapability getModelCapability(String providerName, String modelName) {
        String key = (providerName != null ? providerName : "default") + ":" + 
                     (modelName != null ? modelName : "default");
        
        ModelCapability capability = capabilityCache.get(key);
        if (capability != null) {
            return capability;
        }
        
        // 尝试匹配部分模型名称
        for (Map.Entry<String, ModelCapability> entry : capabilityCache.entrySet()) {
            if (entry.getKey().contains(modelName) || entry.getKey().contains(providerName)) {
                log.debug("Using partial match for model capability: {} -> {}", key, entry.getKey());
                return entry.getValue();
            }
        }
        
        // 返回默认配置
        log.warn("Unknown model capability for {}:{}, using default", providerName, modelName);
        return ModelCapability.defaultCapability();
    }
    
    @Override
    public boolean isModelSupportedForFeature(String providerName, String modelName, 
                                               FeatureName featureName, ChatMode chatMode) {
        ModelCapability capability = getModelCapability(providerName, modelName);
        
        // 根据功能特性判断（参考 void-main 的 modelFilterOfFeatureName）
        switch (featureName) {
            case AUTOCOMPLETE:
                // Autocomplete 需要支持 FIM
                return capability.getSupportsFIM() != null && capability.getSupportsFIM();
                
            case CHAT:
                // Chat 功能所有模型都支持
                return true;
                
            case CODEX:
                // Codex (Ctrl+K) 功能所有模型都支持（但 FIM 模型效果更好）
                return true;
                
            case APPLY:
                // Apply 功能所有模型都支持
                return true;
                
            case SCM:
                // SCM 功能所有模型都支持
                return true;
                
            default:
                return true;
        }
    }
    
    @Override
    public List<String> filterModelsForFeature(List<String> availableModels, 
                                                FeatureName featureName, 
                                                ChatMode chatMode) {
        List<String> filtered = new ArrayList<>();
        
        for (String modelStr : availableModels) {
            // 解析模型字符串（格式：providerName:modelName 或 modelName）
            String providerName = "default";
            String modelName = modelStr;
            
            if (modelStr.contains(":")) {
                String[] parts = modelStr.split(":", 2);
                providerName = parts[0];
                modelName = parts[1];
            }
            
            if (isModelSupportedForFeature(providerName, modelName, featureName, chatMode)) {
                filtered.add(modelStr);
            }
        }
        
        return filtered;
    }
    
    @Override
    public String getFeatureFilterDescription(FeatureName featureName) {
        switch (featureName) {
            case AUTOCOMPLETE:
                return "Requires FIM (Fill-In-The-Middle) support";
            case CHAT:
                return "All models supported";
            case CODEX:
                return "All models supported (FIM models preferred)";
            case APPLY:
                return "All models supported";
            case SCM:
                return "All models supported";
            default:
                return "Unknown feature";
        }
    }
}

