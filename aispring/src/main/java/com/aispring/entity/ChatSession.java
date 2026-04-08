package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 聊天会话实体类
 */
@Entity
@Table(name = "chat_sessions",
    indexes = {
        @Index(name = "idx_session_id", columnList = "session_id", unique = true),
        @Index(name = "idx_user_id", columnList = "user_id")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatSession {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "session_id", nullable = false, length = 255)
    private String sessionId;
    
    @Column(name = "user_id")
    private Long userId;
    
    @Column(name = "title", length = 255)
    private String title;
    
    @Column(name = "suggestions", columnDefinition = "TEXT")
    private String suggestions; // 存储为 JSON 字符串
    
    @Column(name = "session_type", length = 20)
    private String sessionType; // chat, note, etc.

    @Column(name = "current_cwd", length = 500)
    private String currentCwd;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

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
