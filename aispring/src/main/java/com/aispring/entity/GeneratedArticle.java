package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * AI生成文章实体类
 * 对应Python: GeneratedArticle模型
 */
@Entity
@Table(name = "generated_articles",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id"),
        @Index(name = "idx_vocabulary_list_id", columnList = "vocabulary_list_id"),
        @Index(name = "idx_created_at", columnList = "created_at")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GeneratedArticle {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Column(name = "vocabulary_list_id")
    private Integer vocabularyListId;
    
    @Column(name = "topic", length = 255)
    private String topic;  // 文章主题
    
    @Column(name = "difficulty_level", length = 50)
    private String difficultyLevel;  // 难度级别
    
    @Column(name = "article_length", length = 50)
    private String articleLength;  // 文章长度

    @Builder.Default
    @Column(name = "target_language", length = 20, nullable = false)
    private String targetLanguage = "en";
    
    @Column(name = "original_text", columnDefinition = "TEXT", nullable = false)
    private String originalText;  // 文章原文
    
    @Column(name = "translated_text", columnDefinition = "TEXT")
    private String translatedText;  // 文章翻译
    
    @Column(name = "used_word_ids", columnDefinition = "TEXT")
    private String usedWordIds;  // JSON格式存储使用的单词ID列表

    @Builder.Default
    @Column(name = "word_count", nullable = false)
    private Integer wordCount = 0;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder.Default
    @Column(name = "is_deleted", nullable = false)
    private Boolean isDeleted = false;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vocabulary_list_id", insertable = false, updatable = false)
    @JsonIgnore
    private VocabularyList vocabularyList;
    
    @OneToMany(mappedBy = "article", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<ArticleUsedWord> usedWords;
    
    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
        if (isDeleted == null) {
            isDeleted = false;
        }
        if (targetLanguage == null || targetLanguage.isBlank()) {
            targetLanguage = "en";
        }
        if (wordCount == null) {
            wordCount = 0;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

