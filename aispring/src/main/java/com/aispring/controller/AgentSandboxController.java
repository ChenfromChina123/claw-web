package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Agent 沙箱工具代理控制器
 * 
 * 为前端提供直接访问 agent-executor 沙箱的能力
 * 文件操作、终端执行、Git 操作等
 */
@RestController
@RequestMapping("/api/agent/sandbox")
@Slf4j
@RequiredArgsConstructor
public class AgentSandboxController {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${agent-executor.base-url:http://localhost:3001}")
    private String agentExecutorBaseUrl;

    /**
     * 获取系统隔离能力
     */
    @GetMapping(value = "/capabilities", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> getCapabilities() {
        try {
            String url = agentExecutorBaseUrl + "/api/tools/capabilities";
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (Exception e) {
            log.error("Failed to get capabilities: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "获取系统能力失败: " + e.getMessage()));
        }
    }

    /**
     * 列出沙箱文件
     */
    @GetMapping(value = "/{sessionId}/files", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> listFiles(
            @PathVariable String sessionId,
            @RequestParam(defaultValue = ".") String path) {
        try {
            String encodedPath = URLEncoder.encode(path, StandardCharsets.UTF_8);
            String url = agentExecutorBaseUrl + "/api/tools/sandbox/" + sessionId + "/files?path=" + encodedPath;
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JsonNode errorJson = objectMapper.readTree(body);
                return ResponseEntity.ok(ApiResponse.error(400, errorJson.path("error").asText("操作失败")));
            } catch (Exception ex) {
                return ResponseEntity.ok(ApiResponse.error(400, body));
            }
        } catch (Exception e) {
            log.error("Failed to list files: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "列出文件失败: " + e.getMessage()));
        }
    }

    /**
     * 读取文件内容
     */
    @GetMapping(value = "/{sessionId}/file", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> readFile(
            @PathVariable String sessionId,
            @RequestParam String path) {
        try {
            String encodedPath = URLEncoder.encode(path, StandardCharsets.UTF_8);
            String url = agentExecutorBaseUrl + "/api/tools/sandbox/" + sessionId + "/file?path=" + encodedPath;
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JsonNode errorJson = objectMapper.readTree(body);
                return ResponseEntity.ok(ApiResponse.error(400, errorJson.path("error").asText("操作失败")));
            } catch (Exception ex) {
                return ResponseEntity.ok(ApiResponse.error(400, body));
            }
        } catch (Exception e) {
            log.error("Failed to read file: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "读取文件失败: " + e.getMessage()));
        }
    }

    /**
     * 写入文件内容
     */
    @PostMapping(value = "/{sessionId}/file", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> writeFile(
            @PathVariable String sessionId,
            @RequestBody Map<String, String> request) {
        try {
            String url = agentExecutorBaseUrl + "/api/tools/sandbox/" + sessionId + "/file";
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(request, headers);
            
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.POST, entity, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JsonNode errorJson = objectMapper.readTree(body);
                return ResponseEntity.ok(ApiResponse.error(400, errorJson.path("error").asText("操作失败")));
            } catch (Exception ex) {
                return ResponseEntity.ok(ApiResponse.error(400, body));
            }
        } catch (Exception e) {
            log.error("Failed to write file: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "写入文件失败: " + e.getMessage()));
        }
    }

    /**
     * 执行终端命令
     */
    @PostMapping(value = "/{sessionId}/terminal", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> executeTerminal(
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> request) {
        try {
            String url = agentExecutorBaseUrl + "/api/tools/sandbox/" + sessionId + "/terminal";
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);
            
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.POST, entity, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JsonNode errorJson = objectMapper.readTree(body);
                return ResponseEntity.ok(ApiResponse.error(400, errorJson.path("error").asText("操作失败")));
            } catch (Exception ex) {
                return ResponseEntity.ok(ApiResponse.error(400, body));
            }
        } catch (Exception e) {
            log.error("Failed to execute terminal: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "执行命令失败: " + e.getMessage()));
        }
    }

    /**
     * 执行 Git 命令
     */
    @PostMapping(value = "/{sessionId}/git", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> executeGit(
            @PathVariable String sessionId,
            @RequestBody Map<String, String> request) {
        try {
            String url = agentExecutorBaseUrl + "/api/tools/sandbox/" + sessionId + "/git";
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(request, headers);
            
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.POST, entity, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JsonNode errorJson = objectMapper.readTree(body);
                return ResponseEntity.ok(ApiResponse.error(400, errorJson.path("error").asText("操作失败")));
            } catch (Exception ex) {
                return ResponseEntity.ok(ApiResponse.error(400, body));
            }
        } catch (Exception e) {
            log.error("Failed to execute git: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "执行 Git 命令失败: " + e.getMessage()));
        }
    }

    /**
     * 获取沙箱资源使用情况
     */
    @GetMapping(value = "/{sessionId}/usage", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> getUsage(
            @PathVariable String sessionId) {
        try {
            String url = agentExecutorBaseUrl + "/api/tools/sandbox/" + sessionId + "/usage";
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JsonNode errorJson = objectMapper.readTree(body);
                return ResponseEntity.ok(ApiResponse.error(400, errorJson.path("error").asText("操作失败")));
            } catch (Exception ex) {
                return ResponseEntity.ok(ApiResponse.error(400, body));
            }
        } catch (Exception e) {
            log.error("Failed to get usage: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "获取资源使用情况失败: " + e.getMessage()));
        }
    }

    /**
     * 删除沙箱
     */
    @DeleteMapping(value = "/{sessionId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Void>> deleteSandbox(
            @PathVariable String sessionId) {
        try {
            String url = agentExecutorBaseUrl + "/api/tools/sandbox/" + sessionId;
            restTemplate.delete(url);
            return ResponseEntity.ok(ApiResponse.success(null));
        } catch (Exception e) {
            log.error("Failed to delete sandbox: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "删除沙箱失败: " + e.getMessage()));
        }
    }

    /**
     * 通用工具执行接口
     */
    @PostMapping(value = "/execute", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Object>> executeTool(
            @RequestBody Map<String, Object> request) {
        try {
            String url = agentExecutorBaseUrl + "/api/tools/execute";
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);
            
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.POST, entity, String.class);
            
            JsonNode json = objectMapper.readTree(response.getBody());
            return ResponseEntity.ok(ApiResponse.success(objectMapper.convertValue(json, Map.class)));
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JsonNode errorJson = objectMapper.readTree(body);
                return ResponseEntity.ok(ApiResponse.error(400, errorJson.path("error").asText("操作失败")));
            } catch (Exception ex) {
                return ResponseEntity.ok(ApiResponse.error(400, body));
            }
        } catch (Exception e) {
            log.error("Failed to execute tool: {}", e.getMessage());
            return ResponseEntity.ok(ApiResponse.error(500, "执行工具失败: " + e.getMessage()));
        }
    }
}
