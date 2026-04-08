package com.aispring.repository;

import com.aispring.entity.User;
import com.aispring.entity.UserFavorite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 用户收藏仓库接口
 */
@Repository
public interface UserFavoriteRepository extends JpaRepository<UserFavorite, Long> {
    
    /**
     * 根据用户和资源ID查找收藏记录
     */
    Optional<UserFavorite> findByUserAndResourceId(User user, Long resourceId);
    
    /**
     * 根据用户ID查找所有收藏记录
     */
    List<UserFavorite> findByUserId(Long userId);
    
    /**
     * 检查用户是否已收藏该资源
     */
    boolean existsByUserIdAndResourceId(Long userId, Long resourceId);
    
    /**
     * 删除用户的收藏记录
     */
    void deleteByUserIdAndResourceId(Long userId, Long resourceId);
}