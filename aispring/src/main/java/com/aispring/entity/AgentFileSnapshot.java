package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * Agent 文件快照实体类
 */
@Entity
@Table(name = "agent_file_snapshots",
    indexes = {
        @Index(name = "idx_agent_snapshot_session", columnList = "session_id"),
        @Index(name = "idx_agent_snapshot_task", columnList = "task_id")
    }
)
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AgentFileSnapshot {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "session_id", nullable = false)
    private Long sessionId;
    
    @Column(name = "task_id")
    private Long taskId;
    
    @Column(name = "file_path", length = 500, nullable = false)
    private String filePath;
    
    @Column(name = "content_hash", length = 64)
    private String contentHash;
    
    @Column(name = "snapshot_type", length = 50)
    private String snapshotType;
    
    @Column(name = "commit_hash", length = 64)
    private String commitHash;
    
    @Column(name = "commit_message", length = 500)
    private String commitMessage;
    
    @Column(name = "file_size")
    private Long fileSize;
    
    @Column(name = "is_directory", columnDefinition = "BIT DEFAULT 0")
    private Boolean isDirectory = false;
    
    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", insertable = false, updatable = false)
    private AgentSession session;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", insertable = false, updatable = false)
    private AgentTask task;
    
    /**
     * 创建快照类型常量
     */
    public static final String TYPE_INITIAL = "initial";
    public static final String TYPE_PRE_OPERATION = "pre_operation";
    public static final String TYPE_POST_OPERATION = "post_operation";
    public static final String TYPE_MANUAL = "manual";
    public static final String TYPE_ROLLBACK = "rollback";
}
