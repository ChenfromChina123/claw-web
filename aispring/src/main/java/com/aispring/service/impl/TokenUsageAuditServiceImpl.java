package com.aispring.service.impl;

import com.aispring.entity.TokenUsageAudit;
import com.aispring.repository.TokenUsageAuditRepository;
import com.aispring.service.TokenUsageAuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Token 消耗审计服务实现
 * 异步写入审计记录，不阻塞主流程
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TokenUsageAuditServiceImpl implements TokenUsageAuditService {

    private final TokenUsageAuditRepository repository;

    /** 无 usage 时按字符数粗略估算 Token（约 4 字符 1 token） */
    private static final int CHARS_PER_TOKEN_ESTIMATE = 4;

    @Override
    @Async
    public void record(String provider, String modelName, Long userId, String sessionId,
                      Integer inputTokens, Integer outputTokens, long responseTimeMs, boolean streaming) {
        try {
            log.info("=== Token 审计记录 ===");
            log.info("Provider: {}, Model: {}, UserId: {}, SessionId: {}", provider, modelName, userId, sessionId);
            log.info("InputTokens: {}, OutputTokens: {}, ResponseTime: {}ms", inputTokens, outputTokens, responseTimeMs);
            
            int in = inputTokens != null ? inputTokens : 0;
            int out = outputTokens != null ? outputTokens : 0;
            int total = in + out;

            TokenUsageAudit audit = TokenUsageAudit.builder()
                    .provider(provider != null ? provider : "default")
                    .modelName(modelName)
                    .userId(userId)
                    .sessionId(sessionId)
                    .inputTokens(in)
                    .outputTokens(out)
                    .totalTokens(total)
                    .responseTimeMs(responseTimeMs)
                    .streaming(streaming)
                    .build();
            repository.save(audit);
            log.info("Token 审计记录保存成功, ID: {}", audit.getId());
        } catch (Exception e) {
            log.error("Token 审计记录写入失败", e);
        }
    }

    /**
     * 按输入/输出字符数估算 Token 并记录（用于流式或无法获取 usage 时）
     */
    public void recordEstimated(String provider, String modelName, Long userId, String sessionId,
                               int inputChars, int outputChars, long responseTimeMs, boolean streaming) {
        int in = (inputChars + CHARS_PER_TOKEN_ESTIMATE - 1) / CHARS_PER_TOKEN_ESTIMATE;
        int out = (outputChars + CHARS_PER_TOKEN_ESTIMATE - 1) / CHARS_PER_TOKEN_ESTIMATE;
        record(provider, modelName, userId, sessionId, in, out, responseTimeMs, streaming);
    }
}
