package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.Feedback;
import com.aispring.repository.UserRepository;
import com.aispring.security.CustomUserDetails;
import com.aispring.service.FeedbackService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 反馈控制器
 * 对应Python: app.py中的/api/feedback端点
 */
@RestController
@RequestMapping("/api/feedback")
@RequiredArgsConstructor
public class FeedbackController {
    
    private final FeedbackService feedbackService;
    private final UserRepository userRepository;
    
    // DTO类
    @Data
    public static class FeedbackCreateRequest {
        @NotBlank(message = "类型不能为空")
        private String type;
        private String title;
        private String contact;
        
        @NotBlank(message = "内容不能为空")
        private String content;
    }
    
    @Data
    public static class FeedbackUpdateRequest {
        @NotBlank(message = "状态不能为空")
        private String status;
        
        private String adminReply;
    }

    @Data
    public static class AdminFeedbackDTO {
        private Long id;
        private String userEmail;
        private String type;
        private String title;
        private String content;
        private String status;
        private String adminReply;
        private java.time.LocalDateTime createdAt;
    }

    /**
     * 提交反馈
     * Python: POST /api/feedback
     */
    @PostMapping
    public ResponseEntity<ApiResponse<Feedback>> createFeedback(
            @Valid @RequestBody FeedbackCreateRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        String title = (request.getTitle() != null && !request.getTitle().isEmpty())
                ? request.getTitle()
                : (request.getContent().length() > 20 ? request.getContent().substring(0, 20) : request.getContent());
        Feedback feedback = feedbackService.createFeedback(
            userId, request.getType(), title, request.getContent());
        
        return ResponseEntity.ok(ApiResponse.success("反馈提交成功", feedback));
    }

    /**
     * 获取用户的反馈列表
     * Python: GET /api/feedback
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<Feedback>>> getUserFeedback(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        List<Feedback> feedbackList = feedbackService.getUserFeedback(userId);
        
        return ResponseEntity.ok(ApiResponse.success(feedbackList));
    }

    /**
     * 获取反馈详情
     * Python: GET /api/feedback/{feedback_id}
     */
    @GetMapping("/{feedbackId}")
    public ResponseEntity<ApiResponse<Feedback>> getFeedbackById(
            @PathVariable Long feedbackId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Feedback feedback = feedbackService.getFeedbackById(feedbackId);
        
        // 验证是否是用户自己的反馈
        Long userId = customUserDetails.getUser().getId();
        if (!feedback.getUserId().equals(userId)) {
            return ResponseEntity.status(403).body(ApiResponse.error(403, "没有权限访问该反馈"));
        }
        
        return ResponseEntity.ok(ApiResponse.success(feedback));
    }

    /**
     * 管理员：获取所有反馈
     * Python: GET /api/admin/feedback
     */
    @GetMapping("/admin/all")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<AdminFeedbackDTO>>> getAllFeedback() {
        List<Feedback> feedbackList = feedbackService.getAllFeedback();
        List<AdminFeedbackDTO> dtos = feedbackList.stream().map(f -> {
            AdminFeedbackDTO dto = new AdminFeedbackDTO();
            dto.setId(f.getId());
            dto.setType(f.getType());
            dto.setTitle(f.getTitle());
            dto.setContent(f.getContent());
            dto.setStatus(f.getStatus());
            dto.setAdminReply(f.getAdminReply());
            dto.setCreatedAt(f.getCreatedAt());
            
            // 获取用户邮箱
            userRepository.findById(f.getUserId()).ifPresent(u -> dto.setUserEmail(u.getEmail()));
            
            return dto;
        }).collect(Collectors.toList());
        
        return ResponseEntity.ok(ApiResponse.success(dtos));
    }

    /**
     * 管理员：更新反馈状态
     * Python: PUT /api/admin/feedback/{feedback_id}
     */
    @PutMapping("/admin/{feedbackId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Feedback>> updateFeedback(
            @PathVariable Long feedbackId,
            @Valid @RequestBody FeedbackUpdateRequest request) {
        
        Feedback feedback = feedbackService.updateFeedbackStatus(
            feedbackId, request.getStatus(), request.getAdminReply());
        
        return ResponseEntity.ok(ApiResponse.success("反馈状态已更新", feedback));
    }

    /**
     * 管理员：删除反馈
     * Python: DELETE /api/admin/feedback/{feedback_id}
     */
    @DeleteMapping("/admin/{feedbackId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteFeedback(
            @PathVariable Long feedbackId) {
        
        feedbackService.deleteFeedback(feedbackId);
        
        return ResponseEntity.ok(ApiResponse.success("反馈已删除", null));
    }
}
