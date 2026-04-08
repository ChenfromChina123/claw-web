package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 用户文件夹实体类
 */
@Entity
@Table(name = "user_folders",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id"),
        @Index(name = "idx_folder_path", columnList = "folder_path")
    },
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_id", "folder_path"})
    }
)
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserFolder {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, columnDefinition = "BIGINT")
    @JsonIgnore
    private User user;
    
    @Column(name = "folder_name", nullable = false, length = 255)
    private String folderName;
    
    @Column(name = "folder_path", nullable = false, length = 500)
    private String folderPath;
    
    @Column(name = "parent_path", length = 500)
    private String parentPath;
    
    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}

