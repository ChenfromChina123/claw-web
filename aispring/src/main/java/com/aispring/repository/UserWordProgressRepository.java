package com.aispring.repository;

import com.aispring.entity.UserWordProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserWordProgressRepository extends JpaRepository<UserWordProgress, Long> {
    Optional<UserWordProgress> findByUserIdAndWordId(Long userId, Integer wordId);

    // 为 VocabularyService 提供的方法
    @Query("SELECT u FROM UserWordProgress u WHERE u.userId = :userId AND u.nextReviewTime <= :now")
    List<UserWordProgress> findDueForReview(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    @Query("SELECT u FROM UserWordProgress u WHERE u.userId = :userId AND u.wordId IN (SELECT v.id FROM com.aispring.entity.VocabularyWord v WHERE v.vocabularyListId = :listId)")
    List<UserWordProgress> findByUserIdAndVocabularyListId(@Param("userId") Long userId, @Param("listId") Integer listId);

    Long countByUserId(Long userId);

    @Query("SELECT COUNT(u) FROM UserWordProgress u WHERE u.userId = :userId AND u.masteryLevel >= 4")
    Long countMasteredWords(@Param("userId") Long userId);
}
