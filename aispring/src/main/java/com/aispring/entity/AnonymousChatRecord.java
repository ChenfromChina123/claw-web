package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 匿名用户聊天记录实体
 * 用于隔离未登录用户的聊天数据
 */
@Entity
@Table(name = "anonymous_chat_records")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnonymousChatRecord {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "session_id", nullable = false)
    private String sessionId;
    
    @Column(name = "ip_address", nullable = false)
    private String ipAddress;
    
    @Column(name = "role", nullable = false) // "user" or "assistant"
    private String role;
    
    @Column(name = "content", columnDefinition = "TEXT")
    private String content;
    
    @Column(name = "reasoning_content", columnDefinition = "TEXT")
    private String reasoningContent;
    
    @Column(name = "search_query", columnDefinition = "TEXT")
    private String searchQuery;
    
    @Column(name = "search_results", columnDefinition = "TEXT")
    private String searchResults;
    
    @Column(name = "model")
    private String model;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "user_agent")
    private String userAgent;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
