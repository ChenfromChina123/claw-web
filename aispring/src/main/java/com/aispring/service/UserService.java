package com.aispring.service;

import com.aispring.entity.Admin;
import com.aispring.entity.User;
import com.aispring.repository.AdminRepository;
import com.aispring.repository.UserRepository;
import com.aispring.exception.CustomException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 用户服务类
 * 提供用户相关的业务逻辑
 */
@Service
@RequiredArgsConstructor
public class UserService {
    
    private final UserRepository userRepository;
    private final AdminRepository adminRepository;
    
    /**
     * 更新用户头像
     * @param userId 用户ID
     * @param avatarPath 头像相对路径
     * @return 更新后的用户对象
     */
    public User updateAvatar(Long userId, String avatarPath) {
        User user = getUserById(userId);
        user.setAvatar(avatarPath);
        return userRepository.save(user);
    }

    /**
     * 更新用户名
     * @param userId 用户ID
     * @param username 新用户名
     * @return 更新后的用户对象
     */
    public User updateUsername(Long userId, String username) {
        User user = getUserById(userId);
        user.setUsername(username);
        return userRepository.save(user);
    }
    
    /**
     * 根据邮箱获取用户
     * @param email 用户邮箱
     * @return User 用户实体
     * @throws CustomException 当用户不存在时抛出
     */
    public User getUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException("用户不存在: " + email));
    }
    
    /**
     * 将用户设置为管理员
     * @param email 用户邮箱
     * @return Admin 管理员实体
     */
    @Transactional
    public Admin setAsAdmin(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException("用户不存在: " + email));
        
        return adminRepository.findByUser(user)
                .orElseGet(() -> {
                    Admin admin = new Admin();
                    admin.setUser(user);
                    admin.setIsSuperadmin(false);
                    admin.setIsActive(true);
                    admin.setCreatedAt(LocalDateTime.now());
                    return adminRepository.save(admin);
                });
    }

    /**
     * 根据ID获取用户
     * @param userId 用户ID
     * @return User 用户实体
     * @throws CustomException 当用户不存在时抛出
     */
    public User getUserById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new CustomException("用户不存在"));
    }
    
    /**
     * 设置用户默认头像
     * @param user 用户实体
     */
    public void setDefaultAvatar(User user) {
        // 如果用户没有头像，设置默认头像URL
        if (user.getAvatar() == null || user.getAvatar().isEmpty()) {
            // 使用随机默认头像服务，根据用户名生成唯一头像
            String defaultAvatarUrl = String.format("https://ui-avatars.com/api/?name=%s&background=random&color=fff&size=128", 
                                                   user.getUsername().replace(" ", "+"));
            user.setAvatar(defaultAvatarUrl);
        }
    }
}