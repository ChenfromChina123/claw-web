package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * URL过滤规则实体类
 * 用于定义URL匹配规则和过滤行为
 */
@Data
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "url_filter_rules")
public class UrlFilterRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 规则名称
     */
    @Column(nullable = false, length = 100)
    private String name;

    /**
     * 规则描述
     */
    @Column(length = 500)
    private String description;

    /**
     * 过滤类型: BLOCK-阻止, ALLOW-允许, REDIRECT-重定向
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FilterType filterType;

    /**
     * 匹配类型: DOMAIN-域名, URL-完整URL, REGEX-正则表达式, KEYWORD-关键词
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MatchType matchType;

    /**
     * 匹配模式/规则内容
     */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String pattern;

    /**
     * 重定向目标URL（当filterType为REDIRECT时使用）
     */
    @Column(length = 500)
    private String redirectUrl;

    /**
     * 规则优先级（数字越小优先级越高）
     */
    @Column(nullable = false)
    @Builder.Default
    private Integer priority = 100;

    /**
     * 是否启用
     */
    @Column(nullable = false)
    @Builder.Default
    private Boolean enabled = true;

    /**
     * 规则分类（如：广告、恶意网站、成人内容等）
     */
    @Column(length = 50)
    private String category;

    /**
     * 创建者ID
     */
    private Long createdBy;

    /**
     * 创建时间
     */
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * 更新时间
     */
    private LocalDateTime updatedAt;

    /**
     * 过滤类型枚举
     */
    public enum FilterType {
        BLOCK,
        ALLOW,
        REDIRECT
    }

    /**
     * 匹配类型枚举
     */
    public enum MatchType {
        DOMAIN,
        URL,
        REGEX,
        KEYWORD
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
