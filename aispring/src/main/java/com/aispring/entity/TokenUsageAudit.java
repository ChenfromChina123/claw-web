package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Token 消耗审计实体
 * 记录每个 API 提供方/用户维度的 Token 消耗量与响应耗时，用于成本控制与审计
 */
@Entity
@Table(name = "token_usage_audit",
    indexes = {
        @Index(name = "idx_audit_user_id", columnList = "user_id"),
        @Index(name = "idx_audit_provider", columnList = "provider"),
        @Index(name = "idx_audit_created", columnList = "created_at")
    }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TokenUsageAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** API 提供方标识：deepseek / doubao / default */
    @Column(name = "provider", nullable = false, length = 32)
    private String provider;

    /** 模型名称，如 deepseek-chat、doubao-pro-32k */
    @Column(name = "model_name", length = 64)
    private String modelName;

    /** 用户ID，匿名时为 null */
    @Column(name = "user_id")
    private Long userId;

    /** 会话ID，可选 */
    @Column(name = "session_id", length = 255)
    private String sessionId;

    /** 输入 Token 数（来自 API 或估算） */
    @Column(name = "input_tokens")
    private Integer inputTokens;

    /** 输出 Token 数（来自 API 或估算） */
    @Column(name = "output_tokens")
    private Integer outputTokens;

    /** 总 Token 数 */
    @Column(name = "total_tokens")
    private Integer totalTokens;

    /** 响应耗时（毫秒） */
    @Column(name = "response_time_ms")
    private Long responseTimeMs;

    /** 是否流式请求 */
    @Column(name = "streaming")
    private Boolean streaming;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
