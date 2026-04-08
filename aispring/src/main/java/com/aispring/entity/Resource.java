package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 资源实体类
 */
@Entity
@Table(name = "resources")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Resource {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Builder.Default
    @Column(name = "type", length = 50, nullable = false)
    private String type = "article";
    
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;
    
    @Column(name = "title", length = 200, nullable = false)
    private String title;
    
    @Column(name = "url", length = 500, nullable = false)
    private String url;
    
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;
    
    @Builder.Default
    @Column(name = "is_public", nullable = false)
    private Integer isPublic = 1;  // 0: 私有, 1: 公共
    
    @Column(name = "is_favorite", nullable = false)
    @Builder.Default
    private Integer isFavorite = 0;  // 0: 未收藏, 1: 已收藏

    @Column(name = "version", length = 50)
    private String version;

    @Column(name = "file_path", length = 500)
    private String filePath;

    @Column(name = "platform", length = 50)
    private String platform; // 操作系统平台: Windows, Linux, Android, iOS 等

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}

