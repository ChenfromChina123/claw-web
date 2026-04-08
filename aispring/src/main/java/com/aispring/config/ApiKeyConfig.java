package com.aispring.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * API Key 配置类
 */
@Component
public class ApiKeyConfig {

    @Value("${search.api.key:}")
    private String searchApiKey;

    public String getSearchApiKey() {
        return searchApiKey;
    }

    public void setSearchApiKey(String searchApiKey) {
        this.searchApiKey = searchApiKey;
    }

    /**
     * 验证 API Key 是否有效
     */
    public boolean isValidApiKey(String apiKey) {
        if (searchApiKey == null || searchApiKey.trim().isEmpty()) {
            return true; // 未配置时不验证
        }
        return searchApiKey.equals(apiKey);
    }

    /**
     * 检查是否启用了 API Key 验证
     */
    public boolean isApiKeyEnabled() {
        return searchApiKey != null && !searchApiKey.trim().isEmpty();
    }
}
