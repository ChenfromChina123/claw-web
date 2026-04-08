package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 服务器命令执行记录实体类
 * 用于存储用户在服务器上执行的命令及其结果
 */
@Data
@NoArgsConstructor
@Entity
@Table(name = "server_command_executions")
public class ServerCommandExecution {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @ManyToOne
    @JoinColumn(name = "server_id", nullable = false)
    @JsonIgnore
    private ServerConnection server;

    @Column(name = "command", nullable = false, columnDefinition = "TEXT")
    private String command;

    @Column(name = "stdout", columnDefinition = "TEXT")
    private String stdout;

    @Column(name = "stderr", columnDefinition = "TEXT")
    private String stderr;

    @Column(name = "return_code")
    private Integer returnCode;

    @Column(name = "executed_at", nullable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime executedAt;

    // 构造函数
    public ServerCommandExecution(User user, ServerConnection server, String command) {
        this.user = user;
        this.server = server;
        this.command = command;
        this.executedAt = LocalDateTime.now();
    }
}
