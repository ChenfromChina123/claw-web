package com.aispring.repository;

import com.aispring.entity.WordGameProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WordGameProgressRepository extends JpaRepository<WordGameProgress, Long> {
    List<WordGameProgress> findByUserIdAndPackageId(Long userId, String packageId);
    Optional<WordGameProgress> findByUserIdAndPackageIdAndCourseIndex(Long userId, String packageId, Integer courseIndex);
}
