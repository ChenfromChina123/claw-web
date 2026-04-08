package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 词汇上传任务实体类
 * 对应Python: VocabularyUploadTask模型
 */
@Entity
@Table(name = "vocabulary_upload_tasks",
    indexes = {
        @Index(name = "idx_task_id", columnList = "task_id", unique = true),
        @Index(name = "idx_status", columnList = "status")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VocabularyUploadTask {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "task_id", length = 100, nullable = false, unique = true)
    private String taskId;  // 任务唯一标识
    
    @Column(name = "vocabulary_list_id")
    private Integer vocabularyListId;  // 关联的单词表ID
    
    @Builder.Default
    @Column(name = "status", length = 50, nullable = false)
    private String status = "pending";  // pending, processing, completed, failed
    
    @Builder.Default
    @Column(name = "progress", nullable = false)
    private Integer progress = 0;  // 进度百分比 0-100
    
    @Builder.Default
    @Column(name = "total_words", nullable = false)
    private Integer totalWords = 0;  // 总单词数
    
    @Builder.Default
    @Column(name = "processed_words", nullable = false)
    private Integer processedWords = 0;  // 已处理单词数
    
    @Column(name = "message", columnDefinition = "TEXT")
    private String message;  // 状态消息
    
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;  // 错误消息
    
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

