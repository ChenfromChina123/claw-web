package com.aispring.service.impl;

import com.aispring.entity.Category;
import com.aispring.entity.Resource;
import com.aispring.entity.User;
import com.aispring.entity.UserFavorite;
import com.aispring.repository.ResourceRepository;
import com.aispring.repository.UserFavoriteRepository;
import com.aispring.repository.UserRepository;
import com.aispring.service.UserFavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 用户收藏服务实现类
 */
@Service
@RequiredArgsConstructor
public class UserFavoriteServiceImpl implements UserFavoriteService {
    
    private final UserFavoriteRepository userFavoriteRepository;
    private final UserRepository userRepository;
    private final ResourceRepository resourceRepository;
    
    @Override
    @Transactional
    public UserFavorite favoriteResource(Long userId, Long resourceId) {
        // 检查用户是否已收藏该资源
        if (userFavoriteRepository.existsByUserIdAndResourceId(userId, resourceId)) {
            throw new IllegalArgumentException("资源已收藏");
        }
        
        // 获取用户和资源
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("用户不存在"));
        
        Resource resource = resourceRepository.findById(resourceId)
                .orElseThrow(() -> new IllegalArgumentException("资源不存在"));
        
        // 创建收藏记录
        UserFavorite userFavorite = UserFavorite.builder()
                .user(user)
                .resource(resource)
                .build();
        
        return userFavoriteRepository.save(userFavorite);
    }
    
    @Override
    @Transactional
    public void unfavoriteResource(Long userId, Long resourceId) {
        // 检查用户是否已收藏该资源
        if (!userFavoriteRepository.existsByUserIdAndResourceId(userId, resourceId)) {
            throw new IllegalArgumentException("资源未收藏");
        }
        
        // 删除收藏记录
        userFavoriteRepository.deleteByUserIdAndResourceId(userId, resourceId);
    }
    
    @Override
    @Transactional(readOnly = true)
    public boolean isFavorited(Long userId, Long resourceId) {
        return userFavoriteRepository.existsByUserIdAndResourceId(userId, resourceId);
    }
    
    @Override
    @Transactional(readOnly = true)
    public List<Resource> getUserFavorites(Long userId) {
        // 获取用户收藏记录
        List<UserFavorite> favorites = userFavoriteRepository.findByUserId(userId);
        
        // 转换为资源列表
        return favorites.stream()
                .map(UserFavorite::getResource)
                .collect(Collectors.toList());
    }
    
    @Override
    @Transactional(readOnly = true)
    public List<Resource> getUserFavoritesByCategory(Long userId, String categoryName) {
        // 获取用户收藏记录
        List<UserFavorite> favorites = userFavoriteRepository.findByUserId(userId);
        
        // 按分类筛选资源
        return favorites.stream()
                .map(UserFavorite::getResource)
                .filter(resource -> {
                    Category category = resource.getCategory();
                    return category != null && category.getName().equals(categoryName);
                })
                .collect(Collectors.toList());
    }
}