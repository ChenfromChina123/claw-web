package com.aispring.repository;

import com.aispring.entity.Admin;
import com.aispring.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 管理员Repository
 */
@Repository
public interface AdminRepository extends JpaRepository<Admin, Long> {
    
    /**
     * 通过用户查找管理员记录
     */
    Optional<Admin> findByUser(User user);
    
    /**
     * 检查用户是否是管理员
     */
    boolean existsByUser(User user);
}
