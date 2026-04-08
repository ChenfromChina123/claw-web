package com.aispring.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Agent 任务创建请求 DTO
 */
@Data
public class AgentTaskCreateRequest {

    private Long sessionId;

    @NotBlank(message = "任务类型不能为空")
    @Size(max = 50, message = "任务类型长度不能超过50个字符")
    private String taskType;

    @NotBlank(message = "输入内容不能为空")
    private String input;
}
