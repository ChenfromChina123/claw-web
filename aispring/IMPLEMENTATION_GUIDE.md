# Spring Boot 项目实现指南

本文档提供完整的代码实现指南，包括所有核心功能的Java实现。

## 📋 目录

1. [配置类](#配置类)
2. [安全配置](#安全配置)
3. [JWT工具类](#jwt工具类)
4. [Service层](#service层)
5. [Controller层](#controller层)
6. [DTO类](#dto类)
7. [全局异常处理](#全局异常处理)

## 配置类

### SecurityConfig.java

```java
package com.aispring.config;

import com.aispring.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {
    
    private final JwtAuthenticationFilter jwtAuthFilter;
    
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> {})
            .authorizeHttpRequests(auth -> auth
                // 公开端点
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                // 其他需要认证
                .anyRequest().authenticated()
            )
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }
    
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
    
    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
```

### CorsConfig.java

```java
package com.aispring.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
public class CorsConfig {
    
    @Value("${cors.allowed-origins}")
    private String[] allowedOrigins;
    
    @Value("${cors.allowed-methods}")
    private String[] allowedMethods;
    
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList(allowedOrigins));
        configuration.setAllowedMethods(Arrays.asList(allowedMethods));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
```

## 安全配置

### JwtAuthenticationFilter.java

```java
package com.aispring.security;

import com.aispring.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    
    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;
    
    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        
        final String authHeader = request.getHeader("Authorization");
        final String jwt;
        final String userEmail;
        
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }
        
        jwt = authHeader.substring(7);
        userEmail = jwtUtil.extractUsername(jwt);
        
        if (userEmail != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails userDetails = userDetailsService.loadUserByUsername(userEmail);
            
            if (jwtUtil.isTokenValid(jwt, userDetails)) {
                UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                    userDetails,
                    null,
                    userDetails.getAuthorities()
                );
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }
        
        filterChain.doFilter(request, response);
    }
}
```

## JWT工具类

### JwtUtil.java

```java
package com.aispring.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Component
public class JwtUtil {
    
    @Value("${jwt.secret}")
    private String secret;
    
    @Value("${jwt.expiration}")
    private Long expiration;
    
    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }
    
    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }
    
    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }
    
    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }
    
    private Claims extractAllClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
    
    private Boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }
    
    public String generateToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();
        return createToken(claims, userDetails.getUsername());
    }
    
    public String generateToken(UserDetails userDetails, Map<String, Object> extraClaims) {
        return createToken(extraClaims, userDetails.getUsername());
    }
    
    private String createToken(Map<String, Object> claims, String subject) {
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey(), SignatureAlgorithm.HS512)
                .compact();
    }
    
    public Boolean isTokenValid(String token, UserDetails userDetails) {
        final String username = extractUsername(token);
        return (username.equals(userDetails.getUsername()) && !isTokenExpired(token));
    }
}
```

## Service层

### AuthService.java

```java
package com.aispring.service;

import com.aispring.dto.request.LoginRequest;
import com.aispring.dto.request.RegisterRequest;
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
import org.springframework.security.crypto.password.PasswordEncoder;
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
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailUtil emailUtil;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsService userDetailsService;
    
    @Value("${verification.code-expire-minutes}")
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
        user.setUsername(request.getEmail().split("@")[0]);
        user.setEmail(request.getEmail());
        user.setPassword(request.getPassword()); // 会自动加密
        user.setIsActive(true);
        
        userRepository.save(user);
        
        // 标记验证码已使用
        verificationCode.setIsUsed(true);
        verificationCodeRepository.save(verificationCode);
        
        // 生成JWT Token
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        Map<String, Object> extraClaims = new HashMap<>();
        extraClaims.put("user_id", user.getId());
        String token = jwtUtil.generateToken(userDetails, extraClaims);
        
        log.info("用户注册成功: {}", user.getEmail());
        
        return AuthResponse.builder()
                .accessToken(token)
                .tokenType("Bearer")
                .userId(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .isAdmin(user.isAdmin())
                .build();
    }
    
    /**
     * 用户登录
     */
    public AuthResponse login(LoginRequest request) {
        // 验证用户名密码
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getUsername(),
                        request.getPassword()
                )
        );
        
        // 获取用户
        User user = userRepository.findByEmail(request.getUsername())
                .orElseThrow(() -> new CustomException("用户不存在"));
        
        // 更新最后登录时间
        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);
        
        // 生成JWT Token
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        Map<String, Object> extraClaims = new HashMap<>();
        extraClaims.put("user_id", user.getId());
        String token = jwtUtil.generateToken(userDetails, extraClaims);
        
        log.info("用户登录成功: {}", user.getEmail());
        
        return AuthResponse.builder()
                .accessToken(token)
                .tokenType("Bearer")
                .userId(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .isAdmin(user.isAdmin())
                .build();
    }
    
    /**
     * 生成6位数字验证码
     */
    private String generateVerificationCode() {
        Random random = new Random();
        return String.format("%06d", random.nextInt(1000000));
    }
}
```

## Controller层

### AuthController.java

```java
package com.aispring.controller;

import com.aispring.dto.request.EmailRequest;
import com.aispring.dto.request.LoginRequest;
import com.aispring.dto.request.RegisterRequest;
import com.aispring.dto.response.AuthResponse;
import com.aispring.dto.response.MessageResponse;
import com.aispring.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    
    private final AuthService authService;
    
    /**
     * 发送注册验证码
     */
    @PostMapping("/register/send-code")
    public ResponseEntity<MessageResponse> sendRegisterCode(
            @Valid @RequestBody EmailRequest request) {
        authService.sendRegisterCode(request.getEmail());
        return ResponseEntity.ok(
                MessageResponse.builder()
                        .message("验证码已发送到您的邮箱")
                        .build()
        );
    }
    
    /**
     * 用户注册
     */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(
            @Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.ok(response);
    }
    
    /**
     * 用户登录
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }
    
    /**
     * 发送忘记密码验证码
     */
    @PostMapping("/forgot-password/send-code")
    public ResponseEntity<MessageResponse> sendForgotPasswordCode(
            @Valid @RequestBody EmailRequest request) {
        authService.sendForgotPasswordCode(request.getEmail());
        return ResponseEntity.ok(
                MessageResponse.builder()
                        .message("验证码已发送到您的邮箱")
                        .build()
        );
    }
    
    /**
     * 重置密码
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<MessageResponse> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(
                MessageResponse.builder()
                        .message("密码重置成功")
                        .build()
        );
    }
}
```

## DTO类

### 请求DTO

```java
package com.aispring.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LoginRequest {
    
    @NotBlank(message = "用户名不能为空")
    @Email(message = "邮箱格式不正确")
    private String username;
    
    @NotBlank(message = "密码不能为空")
    private String password;
}

@Data
public class RegisterRequest {
    
    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    private String email;
    
    @NotBlank(message = "密码不能为空")
    private String password;
    
    @NotBlank(message = "验证码不能为空")
    private String code;
}

@Data
public class EmailRequest {
    
    @NotBlank(message = "邮箱不能为空")
    @Email(message = "邮箱格式不正确")
    private String email;
}
```

### 响应DTO

```java
package com.aispring.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AuthResponse {
    private String accessToken;
    private String tokenType;
    private Long userId;
    private String username;
    private String email;
    private Boolean isAdmin;
}

@Data
@Builder
public class MessageResponse {
    private String message;
}
```

## 全局异常处理

```java
package com.aispring.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(CustomException.class)
    public ResponseEntity<ErrorResponse> handleCustomException(CustomException ex) {
        ErrorResponse error = ErrorResponse.builder()
                .detail(ex.getMessage())
                .build();
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleBadCredentials(BadCredentialsException ex) {
        ErrorResponse error = ErrorResponse.builder()
                .detail("用户名或密码错误")
                .build();
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error);
    }
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationExceptions(
            MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach((error) -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });
        return ResponseEntity.badRequest().body(errors);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        ErrorResponse error = ErrorResponse.builder()
                .detail("服务器内部错误: " + ex.getMessage())
                .build();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}

@Data
@Builder
class ErrorResponse {
    private String detail;
}
```

## 📝 后续步骤

1. 复制以上代码到对应的文件中
2. 根据需要调整包名和导入
3. 补充其他Controller和Service（参考AuthService模式）
4. 添加单元测试
5. 配置Swagger文档
6. 完善异常处理

## 🎯 重要提示

- 所有代码遵循Spring Boot最佳实践
- 使用Lombok减少样板代码
- 遵循RESTful API设计原则
- 完整的异常处理和验证
- 事务管理(@Transactional)
- 日志记录(@Slf4j)

---

完整的项目代码可以根据此指南逐步实现。

