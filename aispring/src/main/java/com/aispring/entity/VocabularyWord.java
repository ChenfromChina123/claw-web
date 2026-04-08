package com.aispring.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 单词实体类
 * 对应Python: VocabularyWord模型
 */
@Entity
@Table(name = "vocabulary_words",
    indexes = {
        @Index(name = "idx_vocabulary_list_id", columnList = "vocabulary_list_id"),
        @Index(name = "idx_word", columnList = "word"),
        @Index(name = "idx_language", columnList = "language")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VocabularyWord {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    
    @Column(name = "vocabulary_list_id", nullable = false)
    private Integer vocabularyListId;
    
    @Column(name = "word", nullable = false, length = 100)
    private String word;
    
    @Column(name = "definition", columnDefinition = "TEXT")
    private String definition;
    
    @Column(name = "part_of_speech", length = 50)
    private String partOfSpeech;
    
    @Column(name = "example", columnDefinition = "TEXT")
    private String example;
    
    @Builder.Default
    @Column(name = "language", length = 10, nullable = false)
    private String language = "en";
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vocabulary_list_id", insertable = false, updatable = false)
    @JsonIgnore
    private VocabularyList vocabularyList;
    
    @OneToMany(mappedBy = "word", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<UserWordProgress> userProgress;
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}

