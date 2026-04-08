package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 用户练习记录实体类
 * 记录用户每次单词练习的详细信息（包括拼写、复习等）
 */
@Entity
@Table(name = "practice_records",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id"),
        @Index(name = "idx_word_id", columnList = "word_id"),
        @Index(name = "idx_practice_type", columnList = "practice_type"),
        @Index(name = "idx_created_at", columnList = "created_at")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PracticeRecord {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Column(name = "word_id", nullable = false)
    private Integer wordId;
    
    /**
     * 练习类型：spelling(拼写) / review(复习) / listening(听写)
     */
    @Column(name = "practice_type", nullable = false, length = 20)
    private String practiceType;
    
    /**
     * 用户输入的答案
     */
    @Column(name = "user_input", length = 500)
    private String userInput;
    
    /**
     * 正确答案
     */
    @Column(name = "correct_answer", length = 500)
    private String correctAnswer;
    
    /**
     * 是否正确 (true=正确，false=错误)
     */
    @Column(name = "is_correct", nullable = false)
    @Builder.Default
    private Boolean isCorrect = false;
    
    /**
     * 得分 (0-100)
     */
    @Column(name = "score")
    private Integer score;
    
    /**
     * 响应时间（毫秒）
     */
    @Column(name = "response_time")
    private Long responseTime;
    
    /**
     * AI 反馈评价
     */
    @Column(name = "ai_feedback", columnDefinition = "TEXT")
    private String aiFeedback;
    
    /**
     * 练习详情（JSON 格式，存储额外的练习信息）
     */
    @Column(name = "practice_details", columnDefinition = "TEXT")
    private String practiceDetails;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
