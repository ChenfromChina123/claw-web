package com.aispring.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 代码执行请求 DTO
 */
@Data
public class CodeExecutionRequest {

    /**
     * 编程语言标识 (如: python, javascript, java, c, c++)
     */
    @NotBlank(message = "编程语言不能为空")
    private String language;

    /**
     * 语言版本 (可选，为空时使用最新版本)
     */
    private String version;

    /**
     * 源代码
     */
    @NotBlank(message = "代码不能为空")
    @Size(max = 65536, message = "代码长度不能超过64KB")
    private String code;

    /**
     * 标准输入 (可选)
     */
    @Size(max = 8192, message = "输入长度不能超过8KB")
    private String stdin;
}
