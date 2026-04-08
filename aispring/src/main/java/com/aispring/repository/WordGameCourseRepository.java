package com.aispring.repository;

import com.aispring.entity.WordGameCourse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WordGameCourseRepository extends JpaRepository<WordGameCourse, Long> {
    List<WordGameCourse> findByPackageIdOrderByCourseIndexAsc(String packageId);
    Optional<WordGameCourse> findFirstByPackageIdOrderByCourseIndexDesc(String packageId);
}
