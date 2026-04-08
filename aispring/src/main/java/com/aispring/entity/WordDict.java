package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 单词字典实体类 (对接 ECDICT 等外部词库)
 */
@Entity
@Table(name = "word_dict")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordDict {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "word", length = 100, nullable = false, unique = true)
    private String word;

    @Column(name = "phonetic", length = 100)
    private String phonetic;

    @Column(name = "definition", columnDefinition = "TEXT")
    private String definition;

    @Column(name = "translation", columnDefinition = "TEXT")
    private String translation;

    @Column(name = "level_tags", length = 200)
    private String levelTags;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
