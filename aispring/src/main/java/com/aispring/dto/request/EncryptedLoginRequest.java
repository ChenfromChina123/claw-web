package com.aispring.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class EncryptedLoginRequest {
    
    @NotBlank(message = "用户名不能为空")
    @Email(message = "邮箱格式不正确")
    private String email;
    
    @NotBlank(message = "密码不能为空")
    private String password;  // 加密后的密码
    
    private Boolean encrypted = false;  // 标识密码是否已加密
}
