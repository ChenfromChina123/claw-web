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
 * 用户文件实体类
 */
@Entity
@Table(name = "user_files",
    indexes = {
        @Index(name = "idx_user_id", columnList = "user_id"),
        @Index(name = "idx_folder_path", columnList = "folder_path")
    }
)
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserFile {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, columnDefinition = "BIGINT")
    @JsonIgnore
    private User user;
    
    @Column(name = "filename", nullable = false, length = 255)
    private String filename;
    
    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;
    
    @Column(name = "file_path", nullable = false, length = 500)
    private String filepath;
    
    @Column(name = "file_size")
    private Long fileSize;
    
    @Column(name = "file_type", length = 50)
    private String fileType;
    
    @Column(name = "folder_path", length = 500)
    private String folderPath;
    
    @CreatedDate
    @Column(name = "upload_time", nullable = false, updatable = false)
    private LocalDateTime uploadTime;
}

