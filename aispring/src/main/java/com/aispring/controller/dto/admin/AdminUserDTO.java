package com.aispring.controller.dto.admin;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 管理员用户 DTO
 */
@Data
public class AdminUserDTO {
    private Long id;
    private String email;
    private LocalDateTime createdAt;
    private boolean active;
}
