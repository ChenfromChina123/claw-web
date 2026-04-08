package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 用户学习记录实体类
 * 对应Python: UserLearningRecord模型
 */
@Entity
@Table(name = "user_learning_records",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id"),
        @Index(name = "idx_activity_type", columnList = "activity_type"),
        @Index(name = "idx_created_at", columnList = "created_at")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserLearningRecord {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Column(name = "activity_type", length = 50, nullable = false)
    private String activityType;  // vocabulary_review, article_reading 等
    
    @Column(name = "activity_details", columnDefinition = "TEXT")
    private String activityDetails;  // JSON格式的活动详情
    
    @Column(name = "duration")
    private Integer duration;  // 持续时间（秒）
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}

