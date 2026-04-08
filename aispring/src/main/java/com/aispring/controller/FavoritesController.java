package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.Resource;
import com.aispring.service.UserFavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 收藏控制器
 * 处理资源收藏相关的API请求
 */
@RestController
@RequestMapping("/api/favorites")
@RequiredArgsConstructor
public class FavoritesController {
    
    private final UserFavoriteService userFavoriteService;
    
    /**
     * 收藏资源
     */
    @PostMapping("/add")
    public ResponseEntity<ApiResponse<String>> addFavorite(
            @RequestParam Long resourceId) {
        // 这里暂时使用固定的userId，实际应该从当前登录用户获取
        // 后续需要修改为从Authentication对象中正确获取用户ID
        Long userId = 21L;
        userFavoriteService.favoriteResource(userId, resourceId);
        return ResponseEntity.ok(ApiResponse.success("收藏成功", null));
    }
    
    /**
     * 取消收藏资源
     * API文档：POST /api/favorites/remove
     */
    @PostMapping("/remove")
    public ResponseEntity<ApiResponse<String>> removeFavorite(
            @RequestParam Long resourceId) {
        // 这里暂时使用固定的userId，实际应该从当前登录用户获取
        // 后续需要修改为从Authentication对象中正确获取用户ID
        Long userId = 21L;
        userFavoriteService.unfavoriteResource(userId, resourceId);
        return ResponseEntity.ok(ApiResponse.success("取消收藏成功", null));
    }
    
    /**
     * 检查是否已收藏
     */
    @GetMapping("/check")
    public ResponseEntity<ApiResponse<Boolean>> checkFavorite(
            @RequestParam Long resourceId) {
        // 这里暂时使用固定的userId，实际应该从当前登录用户获取
        // 后续需要修改为从Authentication对象中正确获取用户ID
        Long userId = 21L;
        boolean isFavorited = userFavoriteService.isFavorited(userId, resourceId);
        return ResponseEntity.ok(ApiResponse.success("检查收藏状态成功", isFavorited));
    }
    
    /**
     * 获取用户收藏列表
     */
    @GetMapping("/user")
    public ResponseEntity<ApiResponse<List<Resource>>> getUserFavorites(
            @RequestParam(required = false) String categoryName) {
        // 这里暂时使用固定的userId，实际应该从当前登录用户获取
        // 后续需要修改为从Authentication对象中正确获取用户ID
        Long userId = 21L;
        List<Resource> favorites;
        if (categoryName != null && !categoryName.isEmpty()) {
            favorites = userFavoriteService.getUserFavoritesByCategory(userId, categoryName);
        } else {
            favorites = userFavoriteService.getUserFavorites(userId);
        }
        return ResponseEntity.ok(ApiResponse.success("获取收藏列表成功", favorites));
    }
}