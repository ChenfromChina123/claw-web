package com.aispring.controller.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 重命名文件请求 DTO
 */
@Data
public class RenameFileRequest {
    @NotBlank
    @JsonAlias({"newName", "new_name"})
    private String newName;
}
