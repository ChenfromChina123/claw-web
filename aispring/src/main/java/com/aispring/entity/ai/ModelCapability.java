package com.aispring.entity.ai;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 模型能力定义（参考 void-main 的 VoidStaticModelInfo）
 * 
 * 描述模型支持的功能特性
 * 
 * @author AISpring Team
 * @since 2025-12-23
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ModelCapability {
    /**
     * 上下文窗口大小（输入 token 数）
     */
    private Integer contextWindow;
    
    /**
     * 为输出保留的 token 空间
     */
    private Integer reservedOutputTokenSpace;
    
    /**
     * 是否支持系统消息
     * false: 不支持
     * system-role: 使用 system role
     * developer-role: 使用 developer role
     * separated: 作为独立字段传递
     */
    private String supportsSystemMessage;
    
    /**
     * 特殊工具格式
     * null: 使用 XML 格式（默认）
     * openai-style: OpenAI 函数调用格式
     * anthropic-style: Anthropic 工具使用格式
     * gemini-style: Gemini 函数调用格式
     */
    private String specialToolFormat;
    
    /**
     * 是否支持 FIM (Fill-In-The-Middle)
     * 用于代码编辑功能（Codex）
     */
    private Boolean supportsFIM;
    
    /**
     * 是否支持推理模式（Reasoning）
     */
    private Boolean supportsReasoning;
    
    /**
     * 是否可以关闭推理模式
     */
    private Boolean canTurnOffReasoning;
    
    /**
     * 是否可以输出推理过程
     */
    private Boolean canIOReasoning;
    
    /**
     * 默认能力配置（适用于大多数模型）
     */
    public static ModelCapability defaultCapability() {
        return new ModelCapability(
                4096, 4096, "system-role", null, false, false, false, false
        );
    }
    
    /**
     * DeepSeek Chat 模型能力
     */
    public static ModelCapability deepseekChat() {
        return new ModelCapability(
                64000, 4096, "system-role", null, false, false, false, false
        );
    }
    
    /**
     * DeepSeek Reasoner 模型能力
     */
    public static ModelCapability deepseekReasoner() {
        return new ModelCapability(
                64000, 4096, "system-role", null, false, true, false, true
        );
    }
    
    /**
     * 支持 FIM 的模型能力（用于 Codex 功能）
     */
    public static ModelCapability fimCapable() {
        return new ModelCapability(
                32000, 4096, "system-role", null, true, false, false, false
        );
    }
}

