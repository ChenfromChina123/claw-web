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

@Entity
@Table(name = "word_game_statements",
        indexes = {
                @Index(name = "idx_wg_stmt_pkg", columnList = "package_id"),
                @Index(name = "idx_wg_stmt_pkg_course", columnList = "package_id,course_index")
        })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordGameStatement {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "package_id", length = 64, nullable = false)
    private String packageId;

    @Column(name = "course_index", nullable = false)
    private Integer courseIndex;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "english", length = 2000, nullable = false)
    private String english;

    @Column(name = "chinese", length = 2000, nullable = false)
    private String chinese;

    @Column(name = "soundmark", length = 200, nullable = false)
    private String soundmark;
}
