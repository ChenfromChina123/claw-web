package com.aispring.repository;

import com.aispring.entity.PronunciationRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 发音记录数据访问接口
 */
@Repository
public interface PronunciationRecordRepository extends JpaRepository<PronunciationRecord, Long> {
    
    /**
     * 根据用户 ID 查找发音记录（按时间倒序）
     */
    List<PronunciationRecord> findByUserIdOrderByCreatedAtDesc(Long userId);
    
    /**
     * 根据用户 ID 和单词 ID 查找发音记录
     */
    List<PronunciationRecord> findByUserIdAndWordIdOrderByCreatedAtDesc(Long userId, Integer wordId);
    
    /**
     * 根据用户 ID 和时间范围查找发音记录
     */
    @Query("SELECT pr FROM PronunciationRecord pr WHERE pr.userId = :userId " +
           "AND pr.createdAt BETWEEN :startTime AND :endTime ORDER BY pr.createdAt DESC")
    List<PronunciationRecord> findByUserIdAndTimeRange(
        @Param("userId") Long userId,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime
    );
    
    /**
     * 统计用户总发音练习次数
     */
    @Query("SELECT COUNT(pr) FROM PronunciationRecord pr WHERE pr.userId = :userId")
    Long countByUserId(@Param("userId") Long userId);
    
    /**
     * 统计用户指定单词的发音练习次数
     */
    Long countByUserIdAndWordId(Long userId, Integer wordId);
    
    /**
     * 计算用户平均发音得分
     */
    @Query("SELECT COALESCE(AVG(pr.score), 0) FROM PronunciationRecord pr WHERE pr.userId = :userId")
    Double getAverageScore(@Param("userId") Long userId);
    
    /**
     * 计算用户指定单词的平均发音得分
     */
    @Query("SELECT COALESCE(AVG(pr.score), 0) FROM PronunciationRecord pr " +
           "WHERE pr.userId = :userId AND pr.wordId = :wordId")
    Double getAverageScoreByWord(@Param("userId") Long userId, @Param("wordId") Integer wordId);
    
    /**
     * 获取用户今日发音练习次数
     */
    @Query("SELECT COUNT(pr) FROM PronunciationRecord pr " +
           "WHERE pr.userId = :userId AND CAST(pr.createdAt AS date) = CURRENT_DATE")
    Long countTodayByUserId(@Param("userId") Long userId);
    
    /**
     * 获取用户最佳发音得分
     */
    @Query("SELECT COALESCE(MAX(pr.score), 0) FROM PronunciationRecord pr WHERE pr.userId = :userId")
    Integer getBestScore(@Param("userId") Long userId);
}
