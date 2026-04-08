package com.aispring.entity.ai;

/**
 * 功能特性枚举（参考 void-main 的 FeatureName）
 * 
 * 不同的功能特性可以使用不同的模型和配置
 * 
 * @author AISpring Team
 * @since 2025-12-23
 */
public enum FeatureName {
    /**
     * 聊天功能：支持对话、工具调用、任务执行
     */
    CHAT("Chat", "聊天助手"),
    
    /**
     * 代码编辑功能（Ctrl+K）：FIM (Fill-In-The-Middle) 模式
     * 用于在代码中间插入或替换代码片段
     */
    CODEX("Codex", "代码编辑（FIM）"),
    
    /**
     * 自动补全功能：代码自动补全建议
     */
    AUTOCOMPLETE("Autocomplete", "自动补全"),
    
    /**
     * 应用更改功能：将 AI 建议的更改应用到代码
     */
    APPLY("Apply", "应用更改"),
    
    /**
     * 源代码管理功能：生成提交消息等
     */
    SCM("SCM", "提交消息生成");
    
    private final String code;
    private final String displayName;
    
    FeatureName(String code, String displayName) {
        this.code = code;
        this.displayName = displayName;
    }
    
    public String getCode() {
        return code;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    /**
     * 从代码获取枚举值
     */
    public static FeatureName fromCode(String code) {
        for (FeatureName feature : values()) {
            if (feature.code.equalsIgnoreCase(code)) {
                return feature;
            }
        }
        return CHAT; // 默认返回 CHAT
    }
}

