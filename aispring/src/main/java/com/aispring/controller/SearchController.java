package com.aispring.controller;

import com.aispring.config.ApiKeyConfig;
import com.aispring.dto.response.ApiResponse;
import com.aispring.service.SearchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * 搜索控制器
 */
@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
@Slf4j
public class SearchController {

    private final SearchService searchService;
    private final ApiKeyConfig apiKeyConfig;

    /**
     * 执行网络搜索
     * @param q 搜索关键词
     * @param site 可选，指定搜索站点
     * @param apiKey API Key 认证（可选，如果配置了密钥则必须提供）
     * @return 搜索结果
     */
    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> search(
            @RequestParam("q") String q,
            @RequestParam(value = "site", required = false) String site,
            @RequestParam(value = "apiKey", required = false) String apiKeyParam,
            @RequestHeader(value = "X-API-Key", required = false) String apiKeyHeader) {
        
        // 获取 API Key（可以从请求参数或请求头获取）
        String apiKey = apiKeyParam != null ? apiKeyParam : apiKeyHeader;
        
        // 验证 API Key
        if (apiKeyConfig.isApiKeyEnabled() && !apiKeyConfig.isValidApiKey(apiKey)) {
            log.warn("Invalid API Key attempted to access search: {}", apiKey);
            return ResponseEntity.status(401).body(ApiResponse.error(401, "无效的 API Key"));
        }
        
        try {
            // 进行一次解码，防止前端传过来的是已经 urlencode 的字符
            String decodedKeywords = java.net.URLDecoder.decode(q, "UTF-8");
            String result = searchService.searchIndustryInfo(decodedKeywords, site);
            
            Map<String, Object> data = new HashMap<>();
            data.put("query", decodedKeywords);
            data.put("site", site);
            data.put("result", result);
            
            return ResponseEntity.ok(ApiResponse.success(data));
        } catch (Exception e) {
            log.error("Search failed", e);
            return ResponseEntity.status(500).body(ApiResponse.error(500, "搜索执行失败: " + e.getMessage()));
        }
    }
}
