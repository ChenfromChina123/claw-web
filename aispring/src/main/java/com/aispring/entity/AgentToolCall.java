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

/**
 * Agent 工具调用记录实体类
 */
@Entity
@Table(name = "agent_tool_calls",
    indexes = {
        @Index(name = "idx_agent_toolcall_task", columnList = "task_id"),
        @Index(name = "idx_agent_toolcall_name", columnList = "tool_name"),
        @Index(name = "idx_agent_toolcall_status", columnList = "status")
    }
)
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AgentToolCall {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "task_id", nullable = false)
    private Long taskId;
    
    @Column(name = "tool_name", length = 100, nullable = false)
    private String toolName;
    
    @Column(name = "tool_input", columnDefinition = "TEXT")
    private String toolInput;
    
    @Column(name = "tool_output", columnDefinition = "LONGTEXT")
    private String toolOutput;
    
    @Column(length = 50)
    private String status = "pending";
    
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
    
    @Column(name = "duration_ms")
    private Integer durationMs;
    
    @Column(name = "step_number")
    private Integer stepNumber;
    
    @Column(name = "thought", columnDefinition = "TEXT")
    private String thought;
    
    @Column(name = "observation", columnDefinition = "TEXT")
    private String observation;
    
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
    @JoinColumn(name = "task_id", insertable = false, updatable = false)
    private AgentTask task;
    
    /**
     * 开始执行
     */
    public void start() {
        this.status = "running";
        this.startedAt = LocalDateTime.now();
    }
    
    /**
     * 执行成功
     */
    public void succeed(String output) {
        this.status = "success";
        this.toolOutput = output;
        this.completedAt = LocalDateTime.now();
        if (this.startedAt != null) {
            this.durationMs = (int) java.time.Duration.between(this.startedAt, this.completedAt).toMillis();
        }
    }
    
    /**
     * 执行失败
     */
    public void fail(String errorMessage) {
        this.status = "failed";
        this.errorMessage = errorMessage;
        this.completedAt = LocalDateTime.now();
        if (this.startedAt != null) {
            this.durationMs = (int) java.time.Duration.between(this.startedAt, this.completedAt).toMillis();
        }
    }
    
    /**
     * 工具名称常量
     */
    public static final String TOOL_TERMINAL_RUN = "terminal_run";
    public static final String TOOL_READ_FILE = "read_file";
    public static final String TOOL_EDIT_FILE_BY_ANCHOR = "edit_file_by_anchor";
    public static final String TOOL_SEARCH_IN_FILES = "search_in_files";
    public static final String TOOL_LS = "ls";
    public static final String TOOL_UNDO_LAST_ACTION = "undo_last_action";
    public static final String TOOL_WRITE_FILE = "write_file";
}
