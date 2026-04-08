package com.aispring.repository;

import com.aispring.entity.VerificationCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 验证码Repository
 */
@Repository
public interface VerificationCodeRepository extends JpaRepository<VerificationCode, Long> {
    
    /**
     * 查找邮箱的最新未使用的验证码
     */
    Optional<VerificationCode> findFirstByEmailAndIsUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
        String email, LocalDateTime currentTime
    );
    
    /**
     * 查找邮箱的所有验证码
     */
    List<VerificationCode> findByEmail(String email);
    
    /**
     * 删除过期的验证码
     */
    void deleteByExpiresAtBefore(LocalDateTime dateTime);
}

