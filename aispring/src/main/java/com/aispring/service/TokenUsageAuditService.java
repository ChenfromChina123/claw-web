package com.aispring.service;

/**
 * Token 消耗审计服务接口
 * 记录每次大模型调用的 Token 消耗与响应耗时
 */
public interface TokenUsageAuditService {

    /**
     * 记录一次调用审计
     *
     * @param provider    API 提供方：deepseek / doubao / default
     * @param modelName   模型名称
     * @param userId      用户ID，匿名为 null
     * @param sessionId   会话ID，可选
     * @param inputTokens  输入 Token 数（可为 null，将按字符估算）
     * @param outputTokens 输出 Token 数（可为 null，将按字符估算）
     * @param responseTimeMs 响应耗时（毫秒）
     * @param streaming   是否流式请求
     */
    void record(String provider, String modelName, Long userId, String sessionId,
                Integer inputTokens, Integer outputTokens, long responseTimeMs, boolean streaming);

    /**
     * 按输入/输出字符数估算 Token 并记录（流式或无法获取 usage 时使用）
     */
    void recordEstimated(String provider, String modelName, Long userId, String sessionId,
                         int inputChars, int outputChars, long responseTimeMs, boolean streaming);
}
