package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.util.RsaUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * RSA加密控制器
 * 提供公钥给前端进行加密
 */
@RestController
@RequestMapping("/api/rsa")
@RequiredArgsConstructor
public class RsaController {
    
    private final RsaUtil rsaUtil;
    
    /**
     * 获取RSA公钥
     * 前端使用此公钥加密敏感信息（如密码）
     */
    @GetMapping("/public-key")
    public ApiResponse<String> getPublicKey() {
        return ApiResponse.success("获取成功", rsaUtil.getPublicKey());
    }
}
