package com.aispring.controller;

import com.aispring.controller.dto.admin.AdminStatistics;
import com.aispring.controller.dto.admin.AdminUserDTO;
import com.aispring.controller.dto.admin.AdminFileDTO;
import com.aispring.controller.dto.admin.FileContentRequest;
import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.User;
import com.aispring.entity.UserFile;
import com.aispring.repository.ChatRecordRepository;
import com.aispring.repository.UserFileRepository;
import com.aispring.repository.UserRepository;
import com.aispring.service.CloudDiskService;
import com.aispring.utils.FileUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 管理后台控制器
 * 重构后：移除内部 DTO 类，使用独立的 DTO 文件
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Slf4j
public class AdminController {

    private final UserRepository userRepository;
    private final ChatRecordRepository chatRecordRepository;
    private final UserFileRepository userFileRepository;
    private final CloudDiskService cloudDiskService;
    private final com.aispring.repository.TokenUsageAuditRepository tokenUsageAuditRepository;
    private final com.aispring.service.ExternalLinkService externalLinkService;

    /**
     * 获取统计数据
     */
    @GetMapping("/statistics")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<AdminStatistics>> getStatistics() {
        AdminStatistics stats = new AdminStatistics();
        long userCount = userRepository.count();
        long chatCount = chatRecordRepository.count();
        long fileCount = userFileRepository.count();
        Long storage = userFileRepository.sumAllFileSizes();
        long storageSize = storage != null ? storage : 0L;
        
        log.info("Admin Statistics - Users: {}, Chats: {}, Files: {}, Storage: {}", 
                userCount, chatCount, fileCount, storageSize);
        
        stats.setTotalUsers(userCount);
        stats.setTotalChats(chatCount);
        stats.setTotalFiles(fileCount);
        stats.setTotalStorage(storageSize);
        return ResponseEntity.ok(ApiResponse.success(stats));
    }

    /**
     * 获取所有用户列表
     */
    @GetMapping("/users")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getUsers() {
        List<User> allUsers = userRepository.findAll();
        List<AdminUserDTO> userDTOs = allUsers.stream().map(u -> {
            AdminUserDTO dto = new AdminUserDTO();
            dto.setId(u.getId());
            dto.setEmail(u.getEmail());
            dto.setCreatedAt(u.getCreatedAt());
            dto.setActive(u.getIsActive() != null && u.getIsActive());
            return dto;
        }).collect(Collectors.toList());
        
        Map<String, Object> result = new HashMap<>();
        result.put("users", userDTOs);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 获取所有文件列表
     */
    @GetMapping("/files")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<AdminFileDTO>>> getFiles() {
        List<UserFile> allFiles = userFileRepository.findAllWithUser();
        List<AdminFileDTO> fileDTOs = allFiles.stream().map(f -> {
            AdminFileDTO dto = new AdminFileDTO();
            dto.setId(f.getId());
            dto.setFilename(f.getFilename());
            dto.setUserEmail(f.getUser().getEmail());
            dto.setFileSize(f.getFileSize());
            dto.setUploadTime(f.getUploadTime());
            return dto;
        }).collect(Collectors.toList());
        
        return ResponseEntity.ok(ApiResponse.success(fileDTOs));
    }

    /**
     * 下载文件
     */
    @GetMapping("/files/download/{fileId}")
    public ResponseEntity<?> downloadFile(
            @PathVariable Long fileId,
            @RequestParam(required = false) String mode) {
        log.info("Admin download request for fileId: {}, mode: {}", fileId, mode);
        try {
            Path filePath = cloudDiskService.downloadFileAdmin(fileId);
            log.info("Resolved file path: {}", filePath);
            Resource resource = new UrlResource(filePath.toUri());

            if (resource.exists() || resource.isReadable()) {
                String contentType = FileUtils.getContentType(filePath);
                String disposition = "inline".equalsIgnoreCase(mode) ? "inline" : "attachment";
                String originalFilename = filePath.getFileName().toString();
                String encodedFilename = java.net.URLEncoder.encode(originalFilename, "UTF-8").replace("+", "%20");

                HttpHeaders headers = new HttpHeaders();
                headers.set(HttpHeaders.CONTENT_DISPOSITION, disposition + "; filename=\"" + encodedFilename + "\"; filename*=UTF-8''" + encodedFilename);
                headers.set(HttpHeaders.CONTENT_TYPE, contentType);
                headers.set("X-Content-Type-Options", "nosniff");
                headers.setContentLength(resource.contentLength());

                return ResponseEntity.ok().headers(headers).body(resource);
            } else {
                log.warn("File not found or not readable: {}", filePath);
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(ApiResponse.error(404, "文件不存在或不可读: " + filePath.getFileName()));
            }
        } catch (IllegalArgumentException e) {
            log.warn("Invalid file request: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error(400, e.getMessage()));
        } catch (IOException e) {
            log.error("Error downloading file {}: {}", fileId, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(500, "文件不存在或已被删除,请检查文件完整性"));
        } catch (Exception e) {
            log.error("Error downloading file {}: {}", fileId, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(500, "下载文件失败: " + e.getMessage()));
        }
    }

    /**
     * 验证文件完整性
     */
    @GetMapping("/files/verify")
    public ResponseEntity<?> verifyFiles() {
        try {
            Map<String, Object> result = cloudDiskService.verifyAllFiles();
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("Error verifying files: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(500, "验证文件失败: " + e.getMessage()));
        }
    }

    /**
     * 清理孤立的文件记录
     */
    @DeleteMapping("/files/cleanup-orphans")
    public ResponseEntity<?> cleanupOrphanFiles() {
        try {
            Map<String, Object> result = cloudDiskService.cleanupOrphanFiles();
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("Error cleaning up orphan files: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(500, "清理失败: " + e.getMessage()));
        }
    }

    /**
     * 获取文件内容
     */
    @GetMapping("/files/content/{fileId}")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<String>> getFileContent(@PathVariable Long fileId) {
        try {
            String content = cloudDiskService.getFileContentAdmin(fileId);
            return ResponseEntity.ok(ApiResponse.success("获取文件内容成功", content));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(HttpStatus.INTERNAL_SERVER_ERROR.value(), "读取文件失败: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(HttpStatus.INTERNAL_SERVER_ERROR.value(), "获取文件内容失败: " + e.getMessage()));
        }
    }

    /**
     * 更新文件内容
     */
    @PutMapping("/files/content/{fileId}")
    public ResponseEntity<ApiResponse<Void>> updateFileContent(
            @PathVariable Long fileId,
            @Valid @RequestBody FileContentRequest request) {
        try {
            cloudDiskService.updateFileContentAdmin(fileId, request.getContent());
            return ResponseEntity.ok(ApiResponse.success("文件内容更新成功", null));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(HttpStatus.INTERNAL_SERVER_ERROR.value(), "更新文件失败: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(HttpStatus.INTERNAL_SERVER_ERROR.value(), "更新文件内容失败: " + e.getMessage()));
        }
    }

    /**
     * 获取 Token 审计统计
     */
    @GetMapping("/token-audit/stats")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTokenAuditStats(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        
        java.time.LocalDateTime start = startDate != null 
            ? java.time.LocalDateTime.parse(startDate + "T00:00:00")
            : java.time.LocalDateTime.now().minusDays(30);
        java.time.LocalDateTime end = endDate != null
            ? java.time.LocalDateTime.parse(endDate + "T23:59:59")
            : java.time.LocalDateTime.now();
        
        List<com.aispring.entity.TokenUsageAudit> audits = tokenUsageAuditRepository
            .findByCreatedAtBetween(start, end);
        
        long totalRequests = audits.size();
        long totalInputTokens = audits.stream()
            .mapToLong(a -> a.getInputTokens() != null ? a.getInputTokens() : 0)
            .sum();
        long totalOutputTokens = audits.stream()
            .mapToLong(a -> a.getOutputTokens() != null ? a.getOutputTokens() : 0)
            .sum();
        long totalTokens = audits.stream()
            .mapToLong(a -> a.getTotalTokens() != null ? a.getTotalTokens() : 0)
            .sum();
        double avgResponseTime = audits.stream()
            .filter(a -> a.getResponseTimeMs() != null)
            .mapToLong(com.aispring.entity.TokenUsageAudit::getResponseTimeMs)
            .average()
            .orElse(0);
        
        Map<String, Long> byProvider = audits.stream()
            .collect(java.util.stream.Collectors.groupingBy(
                com.aispring.entity.TokenUsageAudit::getProvider,
                java.util.stream.Collectors.counting()
            ));
        
        Map<String, Long> byModel = audits.stream()
            .filter(a -> a.getModelName() != null)
            .collect(java.util.stream.Collectors.groupingBy(
                com.aispring.entity.TokenUsageAudit::getModelName,
                java.util.stream.Collectors.counting()
            ));
        
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalRequests", totalRequests);
        stats.put("totalInputTokens", totalInputTokens);
        stats.put("totalOutputTokens", totalOutputTokens);
        stats.put("totalTokens", totalTokens);
        stats.put("avgResponseTimeMs", Math.round(avgResponseTime));
        stats.put("byProvider", byProvider);
        stats.put("byModel", byModel);
        
        return ResponseEntity.ok(ApiResponse.success(stats));
    }

    /**
     * 获取 Token 审计记录列表
     */
    @GetMapping("/token-audit/records")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getTokenAuditRecords(
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        
        java.time.LocalDateTime start = java.time.LocalDateTime.now().minusDays(7);
        java.time.LocalDateTime end = java.time.LocalDateTime.now();
        
        List<com.aispring.entity.TokenUsageAudit> audits;
        if (provider != null && !provider.isEmpty()) {
            audits = tokenUsageAuditRepository.findByProviderAndCreatedAtBetweenOrderByCreatedAtDesc(
                provider, start, end);
        } else if (userId != null) {
            audits = tokenUsageAuditRepository.findByUserIdAndCreatedAtBetweenOrderByCreatedAtDesc(
                userId, start, end);
        } else {
            audits = tokenUsageAuditRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(start, end);
        }
        
        int fromIndex = page * size;
        int toIndex = Math.min(fromIndex + size, audits.size());
        List<com.aispring.entity.TokenUsageAudit> pageAudits = audits.subList(fromIndex, toIndex);
        
        List<Map<String, Object>> records = pageAudits.stream().map(audit -> {
            Map<String, Object> record = new HashMap<>();
            record.put("id", audit.getId());
            record.put("provider", audit.getProvider());
            record.put("modelName", audit.getModelName());
            record.put("userId", audit.getUserId());
            record.put("sessionId", audit.getSessionId());
            record.put("inputTokens", audit.getInputTokens());
            record.put("outputTokens", audit.getOutputTokens());
            record.put("totalTokens", audit.getTotalTokens());
            record.put("responseTimeMs", audit.getResponseTimeMs());
            record.put("streaming", audit.getStreaming());
            record.put("createdAt", audit.getCreatedAt());
            return record;
        }).collect(Collectors.toList());
        
        return ResponseEntity.ok(ApiResponse.success(records));
    }

    /**
     * 获取所有外部链接
     */
    @GetMapping("/external-links")
    @Transactional(readOnly = true)
    public ResponseEntity<ApiResponse<List<com.aispring.entity.ExternalLink>>> getAllExternalLinks() {
        List<com.aispring.entity.ExternalLink> links = externalLinkService.getAllLinks();
        return ResponseEntity.ok(ApiResponse.success(links));
    }

    /**
     * 创建外部链接
     */
    @PostMapping("/external-links")
    public ResponseEntity<ApiResponse<com.aispring.entity.ExternalLink>> createExternalLink(
            @Valid @RequestBody com.aispring.entity.ExternalLink link) {
        com.aispring.entity.ExternalLink created = externalLinkService.createLink(link);
        return ResponseEntity.ok(ApiResponse.success("创建成功", created));
    }

    /**
     * 更新外部链接
     */
    @PutMapping("/external-links/{id}")
    public ResponseEntity<ApiResponse<com.aispring.entity.ExternalLink>> updateExternalLink(
            @PathVariable Long id,
            @Valid @RequestBody com.aispring.entity.ExternalLink link) {
        com.aispring.entity.ExternalLink updated = externalLinkService.updateLink(id, link);
        return ResponseEntity.ok(ApiResponse.success("更新成功", updated));
    }

    /**
     * 删除外部链接
     */
    @DeleteMapping("/external-links/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteExternalLink(@PathVariable Long id) {
        externalLinkService.deleteLink(id);
        return ResponseEntity.ok(ApiResponse.success("删除成功", null));
    }
}
