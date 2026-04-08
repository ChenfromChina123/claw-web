package com.aispring.repository;

import com.aispring.entity.WordGameStatement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordGameStatementRepository extends JpaRepository<WordGameStatement, Long> {
    List<WordGameStatement> findByPackageIdOrderByCourseIndexAscSortOrderAscIdAsc(String packageId);
    List<WordGameStatement> findByPackageIdAndCourseIndexOrderBySortOrderAscIdAsc(String packageId, Integer courseIndex);
    long countByPackageId(String packageId);
    long countByPackageIdAndCourseIndex(String packageId, Integer courseIndex);
}
