package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 用户设置实体类
 * 对应Python: UserSettings模型
 */
@Entity
@Table(name = "user_settings",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id", unique = true)
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserSettings {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;
    
    @Builder.Default
    @Column(name = "ai_model", length = 50)
    private String aiModel = "deepseek";  // deepseek, doubao, etc.
    
    @Builder.Default
    @Column(name = "theme", length = 20)
    private String theme = "light";  // light, dark
    
    @Builder.Default
    @Column(name = "language", length = 10)
    private String language = "zh-CN";  // zh-CN, en-US
    
    @Builder.Default
    @Column(name = "notifications_enabled", nullable = false)
    private Boolean notificationsEnabled = true;
    
    @Builder.Default
    @Column(name = "email_notifications", nullable = false)
    private Boolean emailNotifications = false;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

