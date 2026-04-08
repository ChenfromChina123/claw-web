package com.aispring.service;

import java.util.List;
import java.util.Map;

public interface WordGameService {
    List<Map<String, Object>> getPackages(Long userId, String search);
    void recordPackageClick(String packageId);
    List<Map<String, Object>> getPackageCourses(Long userId, String packageId);
    List<Map<String, Object>> getCourseQuestions(Long userId, Integer courseIndex, String packageId);
    Map<String, Object> createPackage(Long userId, Map<String, Object> body);
    Map<String, Object> addPackageSection(Long userId, String packageId, Map<String, Object> body);
    Map<String, Object> getProgress(Long userId, String packageId);
    void saveProgress(Long userId, Map<String, Object> body);
    Map<String, Object> migrateProgress(Long userId, Map<String, Object> body);
}
