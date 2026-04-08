package com.aispring.controller.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 解决重命名冲突请求 DTO
 */
@Data
public class ResolveRenameRequest {
    @JsonAlias({"action"})
    private String action;

    @NotBlank
    @JsonAlias({"finalName", "final_name"})
    private String finalName;
}
