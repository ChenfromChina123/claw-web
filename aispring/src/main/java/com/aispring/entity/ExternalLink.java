package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 外部链接实体类
 */
@Entity
@Table(name = "external_links")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExternalLink {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "title", length = 200, nullable = false)
    private String title;
    
    @Column(name = "url", length = 500, nullable = false)
    private String url;
    
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;
    
    @JsonProperty("imageUrl")
    @Column(name = "image_url", length = 500)
    private String imageUrl;
    
    @Builder.Default
    @JsonProperty("clickCount")
    @Column(name = "click_count", nullable = false)
    private Integer clickCount = 0;
    
    @Builder.Default
    @JsonProperty("isActive")
    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;
    
    @JsonProperty("sortOrder")
    @Column(name = "sort_order")
    private Integer sortOrder;
    
    @Column(name = "category", length = 50)
    private String category;
    
    @JsonProperty("createdAt")
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @JsonProperty("updatedAt")
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
