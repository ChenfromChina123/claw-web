package com.aispring.repository;

import com.aispring.entity.TokenUsageAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Token 消耗审计仓储
 */
public interface TokenUsageAuditRepository extends JpaRepository<TokenUsageAudit, Long> {

    /**
     * 按用户ID与时间范围查询
     */
    List<TokenUsageAudit> findByUserIdAndCreatedAtBetweenOrderByCreatedAtDesc(
            Long userId, LocalDateTime start, LocalDateTime end);
    
    /**
     * 按用户ID查询最近N条记录
     */
    List<TokenUsageAudit> findTop10ByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * 按提供方与时间范围查询
     */
    List<TokenUsageAudit> findByProviderAndCreatedAtBetweenOrderByCreatedAtDesc(
            String provider, LocalDateTime start, LocalDateTime end);

    /**
     * 按时间范围查询
     */
    List<TokenUsageAudit> findByCreatedAtBetween(LocalDateTime start, LocalDateTime end);

    /**
     * 按时间范围查询（降序）
     */
    List<TokenUsageAudit> findByCreatedAtBetweenOrderByCreatedAtDesc(LocalDateTime start, LocalDateTime end);
}
