package com.aispring.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "word_game_package_clicks")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WordGamePackageClick {
    @Id
    @Column(name = "package_id", length = 64, nullable = false)
    private String packageId;

    @Column(name = "click_count", nullable = false)
    private Integer clickCount;
}
