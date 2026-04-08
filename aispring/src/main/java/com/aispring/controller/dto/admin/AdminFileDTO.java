package com.aispring.controller.dto.admin;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 管理员文件 DTO
 */
@Data
public class AdminFileDTO {
    private Long id;
    private String filename;
    private String userEmail;
    private Long fileSize;
    private LocalDateTime uploadTime;
}
