package com.aispring.service;

import com.aispring.entity.ai.FeatureName;
import com.aispring.entity.ai.ModelCapability;
import com.aispring.entity.ai.ChatMode;

import java.util.List;

/**
 * 模型能力服务（参考 void-main 的 modelCapabilities.ts）
 * 
 * 负责：
 * 1. 获取模型的能力配置
 * 2. 根据功能特性过滤可用模型
 * 3. 检查模型是否支持特定功能
 * 
 * @author AISpring Team
 * @since 2025-12-23
 */
public interface ModelCapabilityService {
    
    /**
     * 获取模型的能力配置
     * 
     * @param providerName 提供商名称（如 "deepseek", "doubao"）
     * @param modelName 模型名称（如 "deepseek-chat", "deepseek-reasoner"）
     * @return 模型能力配置
     */
    ModelCapability getModelCapability(String providerName, String modelName);
    
    /**
     * 检查模型是否支持特定功能特性
     * 
     * @param providerName 提供商名称
     * @param modelName 模型名称
     * @param featureName 功能特性
     * @param chatMode 聊天模式（可选，用于某些功能的权限判断）
     * @return 是否支持
     */
    boolean isModelSupportedForFeature(String providerName, String modelName, 
                                       FeatureName featureName, ChatMode chatMode);
    
    /**
     * 根据功能特性过滤可用模型列表
     * 
     * @param availableModels 所有可用模型列表（格式：providerName:modelName）
     * @param featureName 功能特性
     * @param chatMode 聊天模式
     * @return 过滤后的模型列表
     */
    List<String> filterModelsForFeature(List<String> availableModels, 
                                        FeatureName featureName, 
                                        ChatMode chatMode);
    
    /**
     * 获取功能特性的模型过滤规则（参考 void-main 的 modelFilterOfFeatureName）
     * 
     * @param featureName 功能特性
     * @return 过滤函数描述（用于日志和调试）
     */
    String getFeatureFilterDescription(FeatureName featureName);
}

