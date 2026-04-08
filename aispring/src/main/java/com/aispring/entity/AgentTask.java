package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Agent 任务实体类
 */
@Entity
@Table(name = "agent_tasks",
    indexes = {
        @Index(name = "idx_agent_task_session", columnList = "session_id"),
        @Index(name = "idx_agent_task_user", columnList = "user_id"),
        @Index(name = "idx_agent_task_status", columnList = "status")
    }
)
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AgentTask {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "session_id", nullable = false)
    private Long sessionId;
    
    @Column(name = "user_id", nullable = false)
    private Long userId;
    
    @Column(name = "task_type", length = 50)
    private String taskType;
    
    @Column(columnDefinition = "TEXT")
    private String input;
    
    @Column(columnDefinition = "LONGTEXT")
    private String output;
    
    @Column(length = 50)
    private String status = "pending";
    
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
    
    @Column(name = "total_steps")
    private Integer totalSteps = 0;
    
    @Column(name = "current_step")
    private Integer currentStep = 0;
    
    @Column(name = "tokens_used")
    private Long tokensUsed = 0L;
    
    @Column(name = "execution_time_ms")
    private Long executionTimeMs = 0L;
    
    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt;
    
    @Column(name = "started_at")
    private LocalDateTime startedAt;
    
    @Column(name = "completed_at")
    private LocalDateTime completedAt;
    
    @JsonIgnore
    @ToString.Exclude
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", insertable = false, updatable = false)
    private AgentSession session;
    
    @JsonIgnore
    @ToString.Exclude
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private User user;
    
    @JsonIgnore
    @ToString.Exclude
    @OneToMany(mappedBy = "task", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<AgentToolCall> toolCalls = new ArrayList<>();
    
    /**
     * 开始任务
     */
    public void start() {
        this.status = "running";
        this.startedAt = LocalDateTime.now();
    }
    
    /**
     * 完成任务
     */
    public void complete(String output) {
        this.status = "completed";
        this.output = output;
        this.completedAt = LocalDateTime.now();
        if (this.startedAt != null) {
            this.executionTimeMs = java.time.Duration.between(this.startedAt, this.completedAt).toMillis();
        }
    }
    
    /**
     * 任务失败
     */
    public void fail(String errorMessage) {
        this.status = "failed";
        this.errorMessage = errorMessage;
        this.completedAt = LocalDateTime.now();
        if (this.startedAt != null) {
            this.executionTimeMs = java.time.Duration.between(this.startedAt, this.completedAt).toMillis();
        }
    }
    
    /**
     * 取消任务
     */
    public void cancel() {
        this.status = "cancelled";
        this.completedAt = LocalDateTime.now();
    }
    
    /**
     * 检查任务是否完成
     */
    public boolean isCompleted() {
        return "completed".equals(this.status) || "failed".equals(this.status) || "cancelled".equals(this.status);
    }
}
