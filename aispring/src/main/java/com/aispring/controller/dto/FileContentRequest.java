package com.aispring.controller.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 文件内容请求 DTO
 */
@Data
public class FileContentRequest {
    @NotBlank
    private String content;
}
