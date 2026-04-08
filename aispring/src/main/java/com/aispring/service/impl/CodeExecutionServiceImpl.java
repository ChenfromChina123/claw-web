package com.aispring.service.impl;

import com.aispring.common.CodeExecutionConstants;
import com.aispring.config.PistonProperties;
import com.aispring.dto.request.CodeExecutionRequest;
import com.aispring.dto.response.CodeExecutionResponse;
import com.aispring.service.CodeExecutionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * 代码执行服务实现
 * 通过 Piston API 执行用户提交的代码
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CodeExecutionServiceImpl implements CodeExecutionService {

    private final RestTemplate restTemplate;
    private final PistonProperties pistonProperties;

    @Override
    public CodeExecutionResponse execute(CodeExecutionRequest request) {
        String apiUrl = pistonProperties.getApiUrl() + "/api/v2/execute";

        // 构造 Piston API 请求体
        Map<String, Object> pistonRequest = new HashMap<>();
        pistonRequest.put("language", request.getLanguage());
        pistonRequest.put("version", request.getVersion() != null ? request.getVersion() : "*");

        // 文件列表
        Map<String, String> file = new HashMap<>();
        file.put("name", CodeExecutionConstants.FILE_NAME_MAP.getOrDefault(request.getLanguage(), "main"));
        file.put("content", request.getCode());
        pistonRequest.put("files", List.of(file));

        // stdin
        if (request.getStdin() != null && !request.getStdin().isEmpty()) {
            pistonRequest.put("stdin", request.getStdin());
        }

        // 安全限制参数
        pistonRequest.put("run_timeout", pistonProperties.getExecuteTimeout());
        pistonRequest.put("compile_timeout", pistonProperties.getExecuteTimeout());
        pistonRequest.put("run_memory_limit", 128_000_000); // 128MB
        pistonRequest.put("compile_memory_limit", 128_000_000);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(pistonRequest, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    apiUrl,
                    HttpMethod.POST,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return mapToResponse(response.getBody());
            } else {
                log.error("Piston API 返回非 2xx 状态: {}", response.getStatusCode());
                return buildErrorResponse("代码执行服务返回异常");
            }
        } catch (RestClientException e) {
            log.error("调用 Piston API 失败: {}", e.getMessage());
            return buildErrorResponse("代码执行服务不可用，请稍后重试");
        }
    }

    @Override
    public List<Map<String, Object>> getAvailableRuntimes() {
        String apiUrl = pistonProperties.getApiUrl() + "/api/v2/runtimes";
        try {
            ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(
                    apiUrl,
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<>() {}
            );
            return response.getBody() != null ? response.getBody() : Collections.emptyList();
        } catch (RestClientException e) {
            log.error("获取 Piston 运行时列表失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    @Override
    public boolean isAvailable() {
        try {
            List<Map<String, Object>> runtimes = getAvailableRuntimes();
            return !runtimes.isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 将 Piston API 响应映射为 CodeExecutionResponse
     */
    @SuppressWarnings("unchecked")
    private CodeExecutionResponse mapToResponse(Map<String, Object> body) {
        CodeExecutionResponse response = new CodeExecutionResponse();
        response.setLanguage((String) body.get("language"));
        response.setVersion((String) body.get("version"));

        Map<String, Object> runMap = (Map<String, Object>) body.get("run");
        if (runMap != null) {
            response.setRun(mapRunResult(runMap));
        }

        Map<String, Object> compileMap = (Map<String, Object>) body.get("compile");
        if (compileMap != null) {
            response.setCompile(mapRunResult(compileMap));
        }

        return response;
    }

    /**
     * 映射执行结果，超长输出自动截断
     */
    private CodeExecutionResponse.RunResult mapRunResult(Map<String, Object> map) {
        CodeExecutionResponse.RunResult result = new CodeExecutionResponse.RunResult();
        result.setStdout(truncateOutput((String) map.get("stdout")));
        result.setStderr(truncateOutput((String) map.get("stderr")));
        result.setOutput(truncateOutput((String) map.get("output")));
        result.setSignal((String) map.get("signal"));

        Object codeVal = map.get("code");
        if (codeVal instanceof Number) {
            result.setCode(((Number) codeVal).intValue());
        }

        return result;
    }

    /**
     * 截断超长输出
     */
    private String truncateOutput(String output) {
        if (output == null) return null;
        if (output.length() > CodeExecutionConstants.MAX_OUTPUT_LENGTH) {
            return output.substring(0, CodeExecutionConstants.MAX_OUTPUT_LENGTH) + "\n...[输出已截断，超过100KB限制]";
        }
        return output;
    }

    /**
     * 构造错误响应
     */
    private CodeExecutionResponse buildErrorResponse(String errorMessage) {
        CodeExecutionResponse response = new CodeExecutionResponse();
        CodeExecutionResponse.RunResult errorResult = new CodeExecutionResponse.RunResult();
        errorResult.setStderr(errorMessage);
        errorResult.setCode(-1);
        response.setRun(errorResult);
        return response;
    }
}
