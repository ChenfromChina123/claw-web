package com.aispring.controller;

import com.aispring.common.RateLimitConstants;
import com.aispring.config.PistonProperties;
import com.aispring.dto.request.CodeExecutionRequest;
import com.aispring.dto.response.CodeExecutionResponse;
import com.aispring.security.CustomUserDetails;
import com.aispring.service.CodeExecutionService;
import com.aispring.service.RateLimitService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * 代码运行沙箱控制器
 * 提供在线代码执行功能，通过 Piston 引擎安全执行用户代码
 */
@RestController
@RequestMapping("/api/playground")
@RequiredArgsConstructor
@Slf4j
public class PlaygroundController {

    private final CodeExecutionService codeExecutionService;
    private final RateLimitService rateLimitService;
    private final PistonProperties pistonProperties;

    /**
     * 执行代码
     */
    @PostMapping("/execute")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> execute(
            @Valid @RequestBody CodeExecutionRequest request,
            @AuthenticationPrincipal CustomUserDetails userDetails) {

        Long userId = userDetails.getUser().getId();
        int maxRequests = pistonProperties.getRateLimit().getMaxRequests();
        int windowHours = pistonProperties.getRateLimit().getWindowHours();

        // 速率限制检查
        boolean allowed = rateLimitService.checkAndIncrement(
                RateLimitConstants.PLAYGROUND_LIMIT_PREFIX,
                String.valueOf(userId),
                maxRequests,
                Duration.ofHours(windowHours)
        );

        if (!allowed) {
            int remaining = rateLimitService.getRemainingRequests(
                    RateLimitConstants.PLAYGROUND_LIMIT_PREFIX, String.valueOf(userId), maxRequests);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of(
                    "message", "执行次数已达上限，请稍后再试",
                    "remaining", remaining,
                    "limitPerHour", maxRequests
            ));
        }

        log.info("用户 {} 执行代码: language={}", userId, request.getLanguage());
        CodeExecutionResponse result = codeExecutionService.execute(request);

        int remaining = rateLimitService.getRemainingRequests(
                RateLimitConstants.PLAYGROUND_LIMIT_PREFIX, String.valueOf(userId), maxRequests);

        return ResponseEntity.ok(Map.of(
                "data", result,
                "remaining", remaining,
                "limitPerHour", maxRequests
        ));
    }

    /**
     * 获取可用运行时列表
     */
    @GetMapping("/runtimes")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Map<String, Object>>> getRuntimes() {
        List<Map<String, Object>> runtimes = codeExecutionService.getAvailableRuntimes();
        return ResponseEntity.ok(runtimes);
    }

    /**
     * 健康检查
     */
    @GetMapping("/health")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        boolean available = codeExecutionService.isAvailable();
        return ResponseEntity.ok(Map.of(
                "status", available ? "healthy" : "unavailable",
                "service", "piston-engine",
                "available", available
        ));
    }
}
