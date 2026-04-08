package com.aispring.graphql.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Token 使用统计信息（独立片段）
 * 
 * 使用场景：
 * - 管理后台需要查看 Token 消耗
 * - 普通用户列表不需要展示
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TokenUsageInfo {
    
    /**
     * 总消耗 Token 数
     */
    private Integer totalTokens;
    
    /**
     * 输入 Token 数
     */
    private Integer inputTokens;
    
    /**
     * 输出 Token 数
     */
    private Integer outputTokens;
    
    /**
     * 平均响应时间（毫秒）
     */
    private Integer avgResponseTime;
    
    /**
     * 使用的 AI 提供商
     */
    private String provider;
}
