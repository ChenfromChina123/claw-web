package com.aispring.util;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class EmailUtil {
    
    private final JavaMailSender mailSender;
    
    @Value("${spring.mail.username}")
    private String fromEmail;
    
    /**
     * 发送验证码邮件
     */
    public void sendVerificationCode(String toEmail, String code, String purpose) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject("【AI智能学习助手】" + purpose + "验证码");
            message.setText(buildVerificationEmailContent(code, purpose));
            
            mailSender.send(message);
            log.info("验证码邮件已发送到: {}", toEmail);
        } catch (Exception e) {
            log.error("发送邮件失败: {}", e.getMessage(), e);
            throw new RuntimeException("发送邮件失败: " + e.getMessage());
        }
    }
    
    /**
     * 构建验证码邮件内容
     */
    private String buildVerificationEmailContent(String code, String purpose) {
        return String.format("""
            尊敬的用户：
            
            您好！
            
            您的%s验证码是：%s
            
            验证码有效期为5分钟，请尽快使用。
            
            如果这不是您的操作，请忽略此邮件。
            
            ———————————————
            AI智能学习助手系统
            此邮件为系统自动发送，请勿回复
            """, purpose, code);
    }
    
    /**
     * 发送通知邮件
     */
    public void sendNotificationEmail(String toEmail, String subject, String content) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject(subject);
            message.setText(content);
            
            mailSender.send(message);
            log.info("通知邮件已发送到: {}", toEmail);
        } catch (Exception e) {
            log.error("发送邮件失败: {}", e.getMessage(), e);
            throw new RuntimeException("发送邮件失败: " + e.getMessage());
        }
    }
}

