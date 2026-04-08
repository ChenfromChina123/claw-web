package com.aispring.controller.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Agent 会话更新请求 DTO
 */
@Data
public class AgentSessionUpdateRequest {

    @Size(max = 255, message = "会话名称长度不能超过255个字符")
    private String name;
}
