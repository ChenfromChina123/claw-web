package com.aispring.security;

import com.aispring.entity.User;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * 自定义UserDetails实现，用于获取当前认证用户
 * 包含User实体的信息，并实现UserDetails接口
 */
public class CustomUserDetails implements org.springframework.security.core.userdetails.UserDetails {
    
    private final User user;
    private final Collection<? extends GrantedAuthority> authorities;
    
    public CustomUserDetails(User user) {
        this.user = user;
        
        // 初始化权限
        List<SimpleGrantedAuthority> authList = new ArrayList<>();
        authList.add(new SimpleGrantedAuthority("ROLE_USER"));
        
        if (user.isAdmin()) {
            authList.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
        }
        
        if (user.isSuperAdmin()) {
            authList.add(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"));
        }
        
        this.authorities = authList;
    }
    
    // 获取原始User实体
    public User getUser() {
        return user;
    }
    
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }
    
    @Override
    public String getPassword() {
        return user.getPasswordHash();
    }
    
    @Override
    public String getUsername() {
        return user.getEmail();
    }
    
    @Override
    public boolean isAccountNonExpired() {
        return true;
    }
    
    @Override
    public boolean isAccountNonLocked() {
        return user.getIsActive();
    }
    
    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }
    
    @Override
    public boolean isEnabled() {
        return user.getIsActive();
    }
}