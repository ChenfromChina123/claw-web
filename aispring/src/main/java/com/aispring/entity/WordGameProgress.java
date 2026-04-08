package com.aispring.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "word_game_progress",
        indexes = {
                @Index(name = "idx_wg_progress_user", columnList = "user_id"),
                @Index(name = "idx_wg_progress_user_pkg", columnList = "user_id,package_id"),
                @Index(name = "idx_wg_progress_unique", columnList = "user_id,package_id,course_index", unique = true)
        })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordGameProgress {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "package_id", length = 64, nullable = false)
    private String packageId;

    @Column(name = "course_index", nullable = false)
    private Integer courseIndex;

    @Column(name = "current_q", nullable = false)
    private Integer currentQuestion;

    @Column(name = "completed", nullable = false)
    private Boolean completed;

    @Column(name = "study_secs", nullable = false)
    private Integer studySeconds;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
