package com.aispring.service;

import com.aispring.entity.Resource;
import com.aispring.entity.UserFavorite;

import java.util.List;

/**
 * 用户收藏服务接口
 */
public interface UserFavoriteService {
    
    /**
     * 收藏资源
     */
    UserFavorite favoriteResource(Long userId, Long resourceId);
    
    /**
     * 取消收藏资源
     */
    void unfavoriteResource(Long userId, Long resourceId);
    
    /**
     * 检查用户是否已收藏资源
     */
    boolean isFavorited(Long userId, Long resourceId);
    
    /**
     * 获取用户收藏的所有资源
     */
    List<Resource> getUserFavorites(Long userId);
    
    /**
     * 获取用户收藏的所有资源，按分类筛选
     */
    List<Resource> getUserFavoritesByCategory(Long userId, String categoryName);
}