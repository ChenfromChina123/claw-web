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
import jakarta.servlet.DispatcherType;

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
                // 允许所有 OPTIONS 请求（预检请求）
                .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
                // 允许异步分发（用于 SSE 等）
                .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                // WebSocket 端点 - 生产环境需要认证
                .requestMatchers("/ws/**").authenticated()
                // 允许认证端点（登录、注册、找回密码）
                .requestMatchers("/api/auth/login", "/api/auth/register", "/api/auth/register/send-code", "/api/auth/forgot-password", "/api/auth/forgot-password/send-code").permitAll()
                // Swagger 文档生产环境关闭
                // .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                // 用户头像公开访问（用于显示用户头像图片）
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/users/avatar/**").permitAll()
                // 资源文件需要认证
                .requestMatchers("/api/resources/public").authenticated()
                // 公开文件需要认证
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/public-files", "/api/public-files/**").authenticated()
                // 外部链接需要认证
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/external-links").authenticated()
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/external-links/*/click").authenticated()
                // URL过滤端点需要认证
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/url-filter/test/**").authenticated()
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/url-filter/check").authenticated()
                // Agent API 端点需要认证
                .requestMatchers("/api/agent/**").authenticated()
                // 测试接口生产环境禁用
                .requestMatchers("/api/auth/test/**").denyAll()
                .requestMatchers("/error").permitAll()
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

