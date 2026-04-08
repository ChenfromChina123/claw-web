package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 文章使用单词关联实体类
 * 对应Python: ArticleUsedWord模型
 */
@Entity
@Table(name = "article_used_words",
    indexes = {
        @Index(name = "idx_article_id", columnList = "article_id"),
        @Index(name = "idx_word_id", columnList = "word_id")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ArticleUsedWord {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    
    @Column(name = "article_id", nullable = false)
    private Integer articleId;
    
    @Column(name = "word_id")
    private Integer wordId;
    
    @Column(name = "word_text", length = 100, nullable = false)
    private String wordText;  // 单词文本（冗余字段，便于查询）
    
    @Builder.Default
    @Column(name = "occurrence_count", nullable = false)
    private Integer occurrenceCount = 1;  // 在文章中出现的次数
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "article_id", insertable = false, updatable = false)
    @JsonIgnore
    private GeneratedArticle article;
    
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "word_id", insertable = false, updatable = false)
    private VocabularyWord word;
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}

