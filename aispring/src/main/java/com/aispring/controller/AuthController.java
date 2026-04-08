package com.aispring.controller;

import com.aispring.dto.request.*;
import com.aispring.dto.response.ApiResponse;
import com.aispring.dto.response.AuthResponse;
import com.aispring.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 认证控制器
 * 对应Python: routers/auth.py
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    
    private final AuthService authService;
    
    /**
     * 发送注册验证码
     * Python端点: POST /api/register/email
     */
    @PostMapping("/register/send-code")
    public ResponseEntity<ApiResponse<Void>> sendRegisterCode(
            @Valid @RequestBody EmailRequest request) {
        authService.sendRegisterCode(request.getEmail());
        return ResponseEntity.ok(ApiResponse.success("验证码已发送到您的邮箱", null));
    }
    
    /**
     * 用户注册
     * Python端点: POST /api/register
     */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(
            @Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.ok(ApiResponse.success("注册成功", response));
    }
    
    /**
     * 用户登录
     * Python端点: POST /api/login
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
            @Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(ApiResponse.success("登录成功", response));
    }
    
    /**
     * 发送忘记密码验证码
     * Python端点: POST /api/forgot-password/email
     */
    @PostMapping("/forgot-password/send-code")
    public ResponseEntity<ApiResponse<Void>> sendForgotPasswordCode(
            @Valid @RequestBody EmailRequest request) {
        authService.sendForgotPasswordCode(request.getEmail());
        return ResponseEntity.ok(ApiResponse.success("验证码已发送到您的邮箱", null));
    }
    
    /**
     * 重置密码
     * Python端点: POST /api/forgot-password
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(ApiResponse.success("密码重置成功", null));
    }
}

