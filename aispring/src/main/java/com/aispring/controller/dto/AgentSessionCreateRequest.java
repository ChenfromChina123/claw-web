package com.aispring.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Agent 会话创建请求 DTO
 */
@Data
public class AgentSessionCreateRequest {

    @Size(max = 255, message = "会话名称长度不能超过255个字符")
    private String name;

    @Size(max = 500, message = "工作目录路径长度不能超过500个字符")
    private String workingDirectory;
}
