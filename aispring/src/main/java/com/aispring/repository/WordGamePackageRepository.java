package com.aispring.repository;

import com.aispring.entity.WordGamePackage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordGamePackageRepository extends JpaRepository<WordGamePackage, String> {
    @Query("""
            SELECT p FROM WordGamePackage p
            WHERE (p.isPublic = true OR p.userId = :userId)
            AND (
                :search IS NULL OR :search = '' OR
                LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) OR
                LOWER(p.description) LIKE LOWER(CONCAT('%', :search, '%'))
            )
            ORDER BY p.createdAt DESC
            """)
    List<WordGamePackage> findVisiblePackages(@Param("userId") Long userId, @Param("search") String search);
}
