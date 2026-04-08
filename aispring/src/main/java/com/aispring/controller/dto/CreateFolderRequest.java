package com.aispring.controller.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 创建文件夹请求 DTO
 */
@Data
public class CreateFolderRequest {
    @NotBlank
    @JsonAlias({"folderName", "folder_name"})
    private String folderName;

    @JsonAlias({"folderPath", "folder_path"})
    private String folderPath;

    @JsonAlias({"parentId", "parent_id"})
    private Long parentId;
}
