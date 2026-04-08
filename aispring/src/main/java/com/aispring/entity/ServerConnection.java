package com.aispring.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 服务器连接实体类
 * 用于存储用户的服务器连接信息
 */
@Data
@NoArgsConstructor
@Entity
@Table(name = "server_connections")
public class ServerConnection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @Column(name = "server_name", nullable = false)
    private String serverName;

    @Column(name = "host", nullable = false)
    private String host;

    @Column(name = "username", nullable = false)
    private String username;

    @JsonIgnore
    @Column(name = "password", nullable = false)
    private String password;

    @Column(name = "port", nullable = false, columnDefinition = "int default 22")
    private Integer port;

    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
    private LocalDateTime updatedAt;

    // 构造函数
    public ServerConnection(User user, String serverName, String host, String username, String password, Integer port) {
        this.user = user;
        this.serverName = serverName;
        this.host = host;
        this.username = username;
        this.password = password;
        this.port = port;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
}
