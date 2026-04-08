package com.aispring.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class EncryptedRegisterRequest {
    
    @NotBlank(message = "用户名不能为空")
    @Size(min = 2, max = 20, message = "用户名长度应在2-20个字符之间")
    private String username;
    
    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    private String email;
    
    @NotBlank(message = "密码不能为空")
    private String password;  // 加密后的密码
    
    @NotBlank(message = "验证码不能为空")
    private String code;  // 验证码
    
    private Boolean encrypted = false;  // 标识密码是否已加密
}
