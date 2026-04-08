package com.aispring.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "word_game_packages",
        indexes = {
                @Index(name = "idx_wg_pkg_user", columnList = "user_id"),
                @Index(name = "idx_wg_pkg_public", columnList = "is_public"),
                @Index(name = "idx_wg_pkg_created", columnList = "created_at")
        })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordGamePackage {
    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "name", length = 200, nullable = false)
    private String name;

    @Column(name = "description", length = 1000, nullable = false)
    private String description;

    @Column(name = "icon", length = 5000, nullable = false)
    private String icon;

    @Column(name = "level", length = 50, nullable = false)
    private String level;

    @Column(name = "is_public", nullable = false)
    private Boolean isPublic;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
