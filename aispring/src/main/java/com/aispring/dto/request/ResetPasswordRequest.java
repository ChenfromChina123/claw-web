package com.aispring.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ResetPasswordRequest {
    
    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    @JsonProperty("email")
    private String email;
    
    @NotBlank(message = "验证码不能为空")
    @JsonProperty("code")
    private String code;
    
    @NotBlank(message = "新密码不能为空")
    @Size(min = 6, message = "密码至少6位")
    @JsonProperty("newPassword")
    private String newPassword;
}

