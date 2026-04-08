package com.aispring.repository;

import com.aispring.entity.WordGamePackageClick;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface WordGamePackageClickRepository extends JpaRepository<WordGamePackageClick, String> {
}
