package com.aispring.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 系统提示词实体类
 * 对应 awesome-prompts 中的 act (role) 和 prompt (content)
 */
@Entity
@Table(name = "system_prompts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SystemPrompt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String role; // 对应 act，如 "Product Manager", "Requirement Analyst"

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content; // 提示词正文

    private String category; // 分类：Role, Task, Domain

    private String language; // 语言：zh, en

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
