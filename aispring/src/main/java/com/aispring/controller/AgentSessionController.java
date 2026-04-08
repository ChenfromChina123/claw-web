package com.aispring.controller;

import com.aispring.controller.dto.AgentSessionCreateRequest;
import com.aispring.controller.dto.AgentSessionUpdateRequest;
import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.AgentSession;
import com.aispring.entity.User;
import com.aispring.security.CustomUserDetails;
import com.aispring.service.AgentSessionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Agent 会话控制器
 */
@RestController
@RequestMapping("/api/agent/sessions")
@Slf4j
@RequiredArgsConstructor
public class AgentSessionController {

    private final AgentSessionService sessionService;

    /**
     * 创建新会话
     */
    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AgentSession>> createSession(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody AgentSessionCreateRequest request) {
        Long userId = userDetails.getUser().getId();
        log.info("Creating session for user: {}", userId);
        AgentSession session = sessionService.createSession(
                userId,
                request.getName(),
                request.getWorkingDirectory()
        );
        return ResponseEntity.ok(ApiResponse.success(session));
    }

    /**
     * 获取会话列表
     */
    @GetMapping(value = "", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<List<AgentSession>>> getSessions(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        Long userId = userDetails.getUser().getId();
        List<AgentSession> sessions = sessionService.getSessionsByUserId(userId);
        return ResponseEntity.ok(ApiResponse.success(sessions));
    }

    /**
     * 分页获取会话列表
     */
    @GetMapping(value = "/page", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Page<AgentSession>>> getSessionsPage(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long userId = userDetails.getUser().getId();
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<AgentSession> sessions = sessionService.getSessionsByUserId(userId, pageRequest);
        return ResponseEntity.ok(ApiResponse.success(sessions));
    }

    /**
     * 获取活跃会话
     */
    @GetMapping(value = "/active", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<List<AgentSession>>> getActiveSessions(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        Long userId = userDetails.getUser().getId();
        List<AgentSession> sessions = sessionService.getActiveSessions(userId);
        return ResponseEntity.ok(ApiResponse.success(sessions));
    }

    /**
     * 获取或创建活跃会话
     */
    @GetMapping(value = "/current", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AgentSession>> getOrCreateCurrentSession(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        Long userId = userDetails.getUser().getId();
        AgentSession session = sessionService.getOrCreateActiveSession(userId);
        return ResponseEntity.ok(ApiResponse.success(session));
    }

    /**
     * 获取会话详情
     */
    @GetMapping(value = "/{sessionId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AgentSession>> getSession(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable Long sessionId) {
        Long userId = userDetails.getUser().getId();
        return sessionService.getSessionById(sessionId, userId)
                .map(session -> ResponseEntity.ok(ApiResponse.success(session)))
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * 更新会话
     */
    @PutMapping(value = "/{sessionId}", produces = MediaType.APPLICATION_JSON_VALUE, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<AgentSession>> updateSession(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable Long sessionId,
            @Valid @RequestBody AgentSessionUpdateRequest request) {
        Long userId = userDetails.getUser().getId();
        AgentSession session = sessionService.updateSession(sessionId, userId, request.getName());
        return ResponseEntity.ok(ApiResponse.success(session));
    }

    /**
     * 关闭会话
     */
    @PostMapping(value = "/{sessionId}/close", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Void>> closeSession(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable Long sessionId) {
        Long userId = userDetails.getUser().getId();
        sessionService.closeSession(sessionId, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /**
     * 删除会话
     */
    @DeleteMapping(value = "/{sessionId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<Void>> deleteSession(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable Long sessionId) {
        Long userId = userDetails.getUser().getId();
        sessionService.deleteSession(sessionId, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
