package com.aispring.controller;

import com.aispring.entity.UserSettings;
import com.aispring.service.UserSettingsService;
import com.aispring.dto.response.MessageResponse;
import com.aispring.security.CustomUserDetails;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 用户设置控制器
 * 对应Python: app.py中的/api/settings端点
 */
@RestController
@RequestMapping("/api/settings")
@RequiredArgsConstructor
public class UserSettingsController {
    
    private final UserSettingsService userSettingsService;
    
    /**
     * 获取用户设置
     * Python: GET /api/settings
     */
    @GetMapping
    public ResponseEntity<UserSettings> getSettings(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        UserSettings settings = userSettingsService.getOrCreateSettings(userId);
        
        return ResponseEntity.ok(settings);
    }
    
    /**
     * 更新用户设置
     * Python: POST /api/settings
     */
    @PostMapping
    public ResponseEntity<UserSettings> updateSettings(
            @RequestBody UserSettings newSettings,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        UserSettings settings = userSettingsService.updateSettings(userId, newSettings);
        
        return ResponseEntity.ok(settings);
    }
    
    /**
     * 删除用户设置
     * Python: DELETE /api/settings
     */
    @DeleteMapping
    public ResponseEntity<MessageResponse> deleteSettings(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        userSettingsService.deleteSettings(userId);
        
        return ResponseEntity.ok(
            MessageResponse.builder()
                .message("设置已删除")
                .build()
        );
    }
}

