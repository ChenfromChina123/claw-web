package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 用户发音记录实体类
 * 记录用户每次发音练习的详细信息
 */
@Entity
@Table(name = "pronunciation_records",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id"),
        @Index(name = "idx_word_id", columnList = "word_id"),
        @Index(name = "idx_created_at", columnList = "created_at")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PronunciationRecord {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Column(name = "word_id", nullable = false)
    private Integer wordId;
    
    /**
     * 目标文本（用户需要朗读的内容）
     */
    @Column(name = "target_text", nullable = false, length = 500)
    private String targetText;
    
    /**
     * 语音识别结果（用户实际朗读的内容）
     */
    @Column(name = "recognized_text", nullable = false, length = 500)
    private String recognizedText;
    
    /**
     * 发音得分 (0-100)
     */
    @Column(name = "score", nullable = false)
    private Integer score;
    
    /**
     * AI 反馈评价
     */
    @Column(name = "ai_feedback", columnDefinition = "TEXT")
    private String aiFeedback;
    
    /**
     * 薄弱单词列表（JSON 格式）
     */
    @Column(name = "weak_words", columnDefinition = "TEXT")
    private String weakWords;
    
    /**
     * 音频文件路径（如果需要保存音频）
     */
    @Column(name = "audio_path", length = 500)
    private String audioPath;
    
    /**
     * 练习模式：pronunciation(发音模式) / spelling(拼写模式)
     */
    @Column(name = "practice_mode", length = 20)
    @Builder.Default
    private String practiceMode = "pronunciation";
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
