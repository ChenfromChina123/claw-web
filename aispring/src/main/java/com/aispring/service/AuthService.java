package com.aispring.service;

import com.aispring.dto.request.LoginRequest;
import com.aispring.dto.request.RegisterRequest;
import com.aispring.dto.request.ResetPasswordRequest;
import com.aispring.dto.response.AuthResponse;
import com.aispring.entity.User;
import com.aispring.entity.VerificationCode;
import com.aispring.exception.CustomException;
import com.aispring.repository.UserRepository;
import com.aispring.repository.VerificationCodeRepository;
import com.aispring.util.EmailUtil;
import com.aispring.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {
    
    private final UserRepository userRepository;
    private final VerificationCodeRepository verificationCodeRepository;
    private final JwtUtil jwtUtil;
    private final EmailUtil emailUtil;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsService userDetailsService;
    private final UserService userService;
    
    @Value("${app.auth.verification-code-expire-minutes:5}")
    private Integer codeExpireMinutes;
    
    /**
     * 发送注册验证码
     */
    @Transactional
    public void sendRegisterCode(String email) {
        // 检查邮箱是否已注册
        if (userRepository.existsByEmail(email)) {
            throw new CustomException("该邮箱已被注册");
        }
        
        // 生成验证码
        String code = generateVerificationCode();
        
        // 保存验证码
        VerificationCode verificationCode = new VerificationCode();
        verificationCode.setEmail(email);
        verificationCode.setCode(code);
        verificationCode.setUsageType("register");
        verificationCode.setExpiresAt(LocalDateTime.now().plusMinutes(codeExpireMinutes));
        verificationCode.setIsUsed(false);
        
        verificationCodeRepository.save(verificationCode);
        
        // 发送邮件
        emailUtil.sendVerificationCode(email, code, "注册");
        
        log.info("发送注册验证码到邮箱: {}", email);
    }
    
    /**
     * 用户注册
     */
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        // 验证验证码
        VerificationCode verificationCode = verificationCodeRepository
                .findFirstByEmailAndIsUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
                        request.getEmail(),
                        LocalDateTime.now()
                )
                .orElseThrow(() -> new CustomException("验证码无效或已过期"));
        
        if (!verificationCode.getCode().equals(request.getCode())) {
            throw new CustomException("验证码错误");
        }
        
        // 检查邮箱是否已注册
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new CustomException("该邮箱已被注册");
        }
        
        // 创建用户
        User user = new User();
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setPassword(request.getPassword()); // 会自动加密
        user.setIsActive(true);
        
        // 设置默认头像
        userService.setDefaultAvatar(user);
        
        userRepository.save(user);
        
        // 如果注册邮箱是 3301767269@qq.com，自动设置为管理员
        if ("3301767269@qq.com".equalsIgnoreCase(user.getEmail())) {
            try {
                userService.setAsAdmin(user.getEmail());
                log.info("新注册用户自动升级为管理员: {}", user.getEmail());
                // 重新从数据库加载用户，以确保获取到最新的 Admin 关联信息
                user = userRepository.findById(user.getId()).orElse(user);
            } catch (Exception e) {
                log.error("自动设置管理员失败: {}", e.getMessage());
            }
        }
        
        // 标记验证码已使用
        verificationCode.setIsUsed(true);
        verificationCodeRepository.save(verificationCode);
        
        // 生成JWT Token
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        Map<String, Object> extraClaims = new HashMap<>();
        extraClaims.put("user_id", user.getId());
        extraClaims.put("is_admin", user.isAdmin());
        String token = jwtUtil.generateToken(userDetails, extraClaims);
        
        log.info("用户注册成功: {}", user.getEmail());
        
        return AuthResponse.builder()
                .accessToken(token)
                .tokenType("Bearer")
                .userId(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .isAdmin(user.isAdmin())
                .avatar(user.getAvatar())
                .build();
    }
    
    /**
     * 创建测试用户（用于开发测试）
     */
    @Transactional
    public AuthResponse createTestUser() {
        String testEmail = "test@example.com";
        String testPassword = "123456";
        
        // 检查用户是否已存在
        User user = userRepository.findByEmail(testEmail).orElse(null);
        
        if (user == null) {
            // 创建新用户
            user = new User();
            user.setUsername("testuser");
            user.setEmail(testEmail);
            user.setPassword(testPassword); // 会自动加密
            user.setIsActive(true);
            user.setLastLogin(LocalDateTime.now());
            
            // 设置默认头像
            userService.setDefaultAvatar(user);
            
            userRepository.save(user);
            
            log.info("测试用户创建成功: {}", testEmail);
        } else {
            // 更新最后登录时间和默认头像
            user.setLastLogin(LocalDateTime.now());
            userService.setDefaultAvatar(user);
            userRepository.save(user);
            
            log.info("测试用户已存在，更新登录时间和头像: {}", testEmail);
        }
        
        // 生成JWT Token
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        Map<String, Object> extraClaims = new HashMap<>();
        extraClaims.put("user_id", user.getId());
        extraClaims.put("is_admin", user.isAdmin());
        String token = jwtUtil.generateToken(userDetails, extraClaims);
        
        return AuthResponse.builder()
                .accessToken(token)
                .tokenType("Bearer")
                .userId(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .isAdmin(user.isAdmin())
                .avatar(user.getAvatar())
                .build();
    }
    
    /**
     * 用户登录
     */
    public AuthResponse login(LoginRequest request) {
        // 验证用户名密码
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getEmail(),
                        request.getPassword()
                )
        );
        
        // 获取用户
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new CustomException("用户不存在"));
        
        // 更新最后登录时间和默认头像
        user.setLastLogin(LocalDateTime.now());
        userService.setDefaultAvatar(user);
        userRepository.save(user);
        
        // 生成JWT Token
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        Map<String, Object> extraClaims = new HashMap<>();
        extraClaims.put("user_id", user.getId());
        extraClaims.put("is_admin", user.isAdmin());
        String token = jwtUtil.generateToken(userDetails, extraClaims);
        
        log.info("用户登录成功: {}", user.getEmail());
        
        return AuthResponse.builder()
                .accessToken(token)
                .tokenType("Bearer")
                .userId(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .isAdmin(user.isAdmin())
                .avatar(user.getAvatar())
                .build();
    }
    
    /**
     * 发送忘记密码验证码
     */
    @Transactional
    public void sendForgotPasswordCode(String email) {
        // 检查邮箱是否存在
        if (!userRepository.existsByEmail(email)) {
            throw new CustomException("该邮箱未注册");
        }
        
        // 生成验证码
        String code = generateVerificationCode();
        
        // 保存验证码
        VerificationCode verificationCode = new VerificationCode();
        verificationCode.setEmail(email);
        verificationCode.setCode(code);
        verificationCode.setUsageType("reset_password");
        verificationCode.setExpiresAt(LocalDateTime.now().plusMinutes(codeExpireMinutes));
        verificationCode.setIsUsed(false);
        
        verificationCodeRepository.save(verificationCode);
        
        // 发送邮件
        emailUtil.sendVerificationCode(email, code, "重置密码");
        
        log.info("发送重置密码验证码到邮箱: {}", email);
    }
    
    /**
     * 重置密码
     */
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        // 验证验证码
        VerificationCode verificationCode = verificationCodeRepository
                .findFirstByEmailAndIsUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
                        request.getEmail(),
                        LocalDateTime.now()
                )
                .orElseThrow(() -> new CustomException("验证码无效或已过期"));
        
        if (!verificationCode.getCode().equals(request.getCode())) {
            throw new CustomException("验证码错误");
        }
        
        // 获取用户
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new CustomException("用户不存在"));
        
        // 更新密码
        user.setPassword(request.getNewPassword()); // 会自动加密
        userRepository.save(user);
        
        // 标记验证码已使用
        verificationCode.setIsUsed(true);
        verificationCodeRepository.save(verificationCode);
        
        log.info("用户重置密码成功: {}", user.getEmail());
    }
    
    /**
     * 生成6位数字验证码
     */
    private String generateVerificationCode() {
        Random random = new Random();
        return String.format("%06d", random.nextInt(1000000));
    }
}

