package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 公共单词库实体类
 * 对应Python: PublicVocabularyWord模型
 */
@Entity
@Table(name = "public_vocabulary_words",
    indexes = {
        @Index(name = "idx_word", columnList = "word"),
        @Index(name = "idx_language", columnList = "language"),
        @Index(name = "idx_tag", columnList = "tag")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PublicVocabularyWord {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    
    @Column(name = "word", nullable = false, length = 100)
    private String word;
    
    @Builder.Default
    @Column(name = "language", length = 10, nullable = false)
    private String language = "en";
    
    @Column(name = "definition", columnDefinition = "TEXT", nullable = false)
    private String definition;  // 经过AI处理的标准释义
    
    @Column(name = "part_of_speech", length = 50, nullable = false)
    private String partOfSpeech;  // 经过AI处理的标准词性
    
    @Column(name = "example", columnDefinition = "TEXT")
    private String example;  // 示例句子
    
    @Column(name = "tag", length = 50)
    private String tag;  // 标签：四级、六级、托福、雅思等
    
    @Builder.Default
    @Column(name = "usage_count", nullable = false)
    private Integer usageCount = 0;  // 被使用的次数
    
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

