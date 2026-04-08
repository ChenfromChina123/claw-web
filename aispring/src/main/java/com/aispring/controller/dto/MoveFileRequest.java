package com.aispring.controller.dto;

import lombok.Data;

/**
 * 移动文件请求 DTO
 */
@Data
public class MoveFileRequest {
    private Long targetFolderId;
    private String targetPath;
}
