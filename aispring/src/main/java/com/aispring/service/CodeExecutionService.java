package com.aispring.service;

import com.aispring.dto.request.CodeExecutionRequest;
import com.aispring.dto.response.CodeExecutionResponse;

import java.util.List;
import java.util.Map;

/**
 * 代码执行服务接口
 */
public interface CodeExecutionService {

    /**
     * 执行代码
     * @param request 代码执行请求
     * @return 执行结果
     */
    CodeExecutionResponse execute(CodeExecutionRequest request);

    /**
     * 获取可用语言运行时列表
     * @return 运行时列表
     */
    List<Map<String, Object>> getAvailableRuntimes();

    /**
     * 检查 Piston 服务是否可用
     * @return 是否可用
     */
    boolean isAvailable();
}
