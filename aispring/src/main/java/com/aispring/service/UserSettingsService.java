package com.aispring.service;

import com.aispring.entity.UserSettings;
import com.aispring.repository.UserSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 用户设置服务
 * 对应Python: app.py中的用户设置相关功能
 */
@Service
@RequiredArgsConstructor
public class UserSettingsService {
    
    private final UserSettingsRepository userSettingsRepository;
    
    /**
     * 获取或创建用户设置
     */
    public UserSettings getOrCreateSettings(Long userId) {
        return userSettingsRepository.findByUserId(userId)
            .orElseGet(() -> createDefaultSettings(userId));
    }
    
    /**
     * 创建默认设置
     */
    @Transactional
    public UserSettings createDefaultSettings(Long userId) {
        UserSettings settings = UserSettings.builder()
            .userId(userId)
            .aiModel("deepseek")
            .theme("light")
            .language("zh-CN")
            .notificationsEnabled(true)
            .emailNotifications(false)
            .build();
        return userSettingsRepository.save(settings);
    }
    
    /**
     * 更新用户设置
     */
    @Transactional
    public UserSettings updateSettings(Long userId, UserSettings newSettings) {
        UserSettings settings = getOrCreateSettings(userId);
        
        if (newSettings.getAiModel() != null) {
            settings.setAiModel(newSettings.getAiModel());
        }
        if (newSettings.getTheme() != null) {
            settings.setTheme(newSettings.getTheme());
        }
        if (newSettings.getLanguage() != null) {
            settings.setLanguage(newSettings.getLanguage());
        }
        if (newSettings.getNotificationsEnabled() != null) {
            settings.setNotificationsEnabled(newSettings.getNotificationsEnabled());
        }
        if (newSettings.getEmailNotifications() != null) {
            settings.setEmailNotifications(newSettings.getEmailNotifications());
        }
        
        return userSettingsRepository.save(settings);
    }
    
    /**
     * 删除用户设置
     */
    @Transactional
    public void deleteSettings(Long userId) {
        userSettingsRepository.deleteByUserId(userId);
    }
}

