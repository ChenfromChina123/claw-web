package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Agent 会话实体类
 */
@Entity
@Table(name = "agent_sessions",
    indexes = {
        @Index(name = "idx_agent_session_user", columnList = "user_id"),
        @Index(name = "idx_agent_session_status", columnList = "status")
    }
)
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AgentSession {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Column(length = 255)
    private String name;
    
    @Column(name = "working_directory", length = 500)
    private String workingDirectory;
    
    @Column(length = 50)
    private String status = "active";
    
    @Column(name = "sandbox_path", length = 500)
    private String sandboxPath;
    
    @Column(name = "git_initialized", columnDefinition = "BIT DEFAULT 0")
    private Boolean gitInitialized = false;
    
    @Column(name = "current_branch", length = 100)
    private String currentBranch;
    
    @Column(name = "last_commit_hash", length = 64)
    private String lastCommitHash;
    
    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    @Column(name = "updated_at", columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
    private LocalDateTime updatedAt;
    
    @Column(name = "closed_at")
    private LocalDateTime closedAt;
    
    @JsonIgnore
    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    @ToString.Exclude
    private List<AgentTask> tasks = new ArrayList<>();

    @JsonIgnore
    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    @ToString.Exclude
    private List<AgentFileSnapshot> snapshots = new ArrayList<>();
    
    @JsonIgnore
    @ToString.Exclude
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private User user;
    
    /**
     * 关闭会话
     */
    public void close() {
        this.status = "closed";
        this.closedAt = LocalDateTime.now();
    }
    
    /**
     * 检查会话是否活跃
     */
    public boolean isActive() {
        return "active".equals(this.status);
    }
}
