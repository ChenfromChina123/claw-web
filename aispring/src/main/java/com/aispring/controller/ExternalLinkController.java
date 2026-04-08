package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.ExternalLink;
import com.aispring.service.ExternalLinkService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 外部链接控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/external-links")
@RequiredArgsConstructor
public class ExternalLinkController {
    
    private final ExternalLinkService externalLinkService;
    
    /**
     * 获取所有激活的链接（公开接口，不需要登录）
     */
    @GetMapping
    public ApiResponse<List<ExternalLink>> getAllActiveLinks() {
        List<ExternalLink> links = externalLinkService.getAllActiveLinks();
        return ApiResponse.success(links);
    }
    
    /**
     * 记录点击并返回最新点击次数（持久化到数据库）
     */
    @PostMapping("/{id}/click")
    public ApiResponse<Integer> recordClick(
            @PathVariable Long id,
            HttpServletRequest request) {
        
        String userAgent = request.getHeader("User-Agent");
        String clientIp = getClientIp(request);
        
        int newClickCount = externalLinkService.recordClick(id, userAgent, clientIp);
        
        log.info("📊 返回最新点击次数 - LinkId: {}, ClickCount: {}", id, newClickCount);
        
        return ApiResponse.success(newClickCount);
    }
    
    /**
     * 获取客户端真实IP
     */
    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // 如果是多级代理，取第一个IP
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
