package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 用户单词进度实体类
 * 对应Python: UserWordProgress模型
 */
@Entity
@Table(name = "user_word_progress",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id"),
        @Index(name = "idx_word_id", columnList = "word_id"),
        @Index(name = "idx_user_word", columnList = "user_id, word_id", unique = true)
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserWordProgress {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Column(name = "word_id", nullable = false)
    private Integer wordId;
    
    /**
     * 状态: 0=未学, 1=学习中, 2=已掌握, 3=易错
     */
    @Builder.Default
    @Column(name = "status", nullable = false)
    private Integer status = 0;

    @Builder.Default
    @Column(name = "error_count", nullable = false)
    private Integer errorCount = 0;

    @Column(name = "next_review_time")
    private LocalDateTime nextReviewTime;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    // 兼容原有的旧字段
    @Column(name = "mastery_level")
    private Integer masteryLevel;

    @Column(name = "is_difficult")
    private Boolean isDifficult;

    @Column(name = "last_reviewed")
    private LocalDateTime lastReviewed;

    @Column(name = "review_count")
    private Integer reviewCount;

    @Column(name = "next_review_date")
    private LocalDateTime nextReviewDate;
    
    /**
     * 发音练习次数
     */
    @Builder.Default
    @Column(name = "pronunciation_count")
    private Integer pronunciationCount = 0;
    
    /**
     * 发音平均得分
     */
    @Column(name = "pronunciation_avg_score")
    private Double pronunciationAvgScore;
    
    /**
     * 最佳发音得分
     */
    @Column(name = "pronunciation_best_score")
    private Integer pronunciationBestScore;
    
    /**
     * 拼写练习次数
     */
    @Builder.Default
    @Column(name = "spelling_count")
    private Integer spellingCount = 0;
    
    /**
     * 拼写正确次数
     */
    @Builder.Default
    @Column(name = "spelling_correct_count")
    private Integer spellingCorrectCount = 0;
    
    /**
     * 总练习次数（所有类型）
     */
    @Builder.Default
    @Column(name = "total_practice_count")
    private Integer totalPracticeCount = 0;
    
    /**
     * 最后发音练习时间
     */
    @Column(name = "last_pronunciation_time")
    private LocalDateTime lastPronunciationTime;
    
    /**
     * 最后拼写练习时间
     */
    @Column(name = "last_spelling_time")
    private LocalDateTime lastSpellingTime;
    
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "word_id", insertable = false, updatable = false)
    private VocabularyWord word;
    
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

