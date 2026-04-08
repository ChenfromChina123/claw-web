package com.aispring.dto.response;

import lombok.Data;

/**
 * 代码执行响应 DTO
 */
@Data
public class CodeExecutionResponse {

    private String language;
    private String version;
    private RunResult compile;
    private RunResult run;

    /**
     * 执行结果内部类
     */
    @Data
    public static class RunResult {
        private String stdout;
        private String stderr;
        private int code;
        private String signal;
        private String output;
    }
}
