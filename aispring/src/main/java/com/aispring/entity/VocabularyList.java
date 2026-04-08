package com.aispring.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 单词表实体类
 * 对应Python: VocabularyList模型
 */
@Entity
@Table(name = "vocabulary_lists",
    indexes = {
        @Index(name = "idx_language", columnList = "language"),
        @Index(name = "idx_created_by", columnList = "created_by")
    }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VocabularyList {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    
    @Column(name = "name", nullable = false, length = 255)
    private String name;
    
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;
    
    @Builder.Default
    @Column(name = "language", length = 10, nullable = false)
    private String language = "en";  // 语言代码：en, zh, ja, ko, fr, de, es等
    
    @Builder.Default
    @Column(name = "is_preset", nullable = false)
    private Boolean isPreset = false;
    
    @Builder.Default
    @Column(name = "is_public", nullable = false)
    private Boolean isPublic = false;
    
    @Column(name = "created_by")
    private Long createdBy;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
    
    @OneToMany(mappedBy = "vocabularyList", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<VocabularyWord> words;

    @Transient
    @JsonProperty
    private Long wordCount;
    
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

