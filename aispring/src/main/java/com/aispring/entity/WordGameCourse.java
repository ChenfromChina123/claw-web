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
@Table(name = "word_game_courses",
        indexes = {
                @Index(name = "idx_wg_course_pkg", columnList = "package_id"),
                @Index(name = "idx_wg_course_pkg_idx", columnList = "package_id,course_index", unique = true)
        })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordGameCourse {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "package_id", length = 64, nullable = false)
    private String packageId;

    @Column(name = "course_index", nullable = false)
    private Integer courseIndex;

    @Column(name = "title", length = 200, nullable = false)
    private String title;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
