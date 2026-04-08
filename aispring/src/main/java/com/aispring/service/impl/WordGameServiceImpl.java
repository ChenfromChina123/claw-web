package com.aispring.service.impl;

import com.aispring.entity.WordGameCourse;
import com.aispring.entity.WordGamePackage;
import com.aispring.entity.WordGamePackageClick;
import com.aispring.entity.WordGameStatement;
import com.aispring.repository.WordGameCourseRepository;
import com.aispring.repository.WordGamePackageClickRepository;
import com.aispring.repository.WordGamePackageRepository;
import com.aispring.repository.WordGameStatementRepository;
import com.aispring.service.WordGameService;
import com.aispring.service.impl.wordgame.BuiltinCourseLoader;
import com.aispring.service.impl.wordgame.ProgressTrackingService;
import com.aispring.service.impl.wordgame.WordGameUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * 单词游戏服务实现类
 * 重构后：协调服务，委托具体功能给专门的服务类
 */
@Service
@RequiredArgsConstructor
public class WordGameServiceImpl implements WordGameService {

    private final WordGamePackageRepository packageRepository;
    private final WordGameCourseRepository courseRepository;
    private final WordGameStatementRepository statementRepository;
    private final WordGamePackageClickRepository clickRepository;
    private final BuiltinCourseLoader builtinCourseLoader;
    private final ProgressTrackingService progressTrackingService;

    /**
     * 获取课程包列表
     */
    @Override
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getPackages(Long userId, String search) {
        List<Map<String, Object>> result = new ArrayList<>();
        
        // 添加内置课程包
        List<Map<String, Object>> builtinCourses = builtinCourseLoader.loadBuiltinCourses();
        if (WordGameUtils.matchSearch("星荣零基础学英语", 
                "从零开始，系统掌握日常英语词汇与基础句型，适合完全零基础的学习者。", search)) {
            int totalQuestions = builtinCourses.stream()
                    .mapToInt(it -> WordGameUtils.asInt(it.get("count"), 0))
                    .sum();
            Map<String, Object> builtin = new LinkedHashMap<>();
            builtin.put("id", builtinCourseLoader.getBuiltinPackageId());
            builtin.put("name", "星荣零基础学英语");
            builtin.put("description", "从零开始，系统掌握日常英语词汇与基础句型，适合完全零基础的学习者。");
            builtin.put("icon", "🌟");
            builtin.put("level", "零基础");
            builtin.put("courseCount", builtinCourses.size());
            builtin.put("totalQuestions", totalQuestions);
            builtin.put("clickCount", getClickCount(builtinCourseLoader.getBuiltinPackageId()));
            result.add(builtin);
        }

        // 添加用户课程包
        List<WordGamePackage> userPackages = packageRepository.findVisiblePackages(
                userId, WordGameUtils.emptyToNull(search));
        for (WordGamePackage pkg : userPackages) {
            result.add(buildPackageMeta(pkg));
        }

        result.sort((a, b) -> Integer.compare(
                WordGameUtils.asInt(b.get("clickCount"), 0),
                WordGameUtils.asInt(a.get("clickCount"), 0)));
        return result;
    }

    /**
     * 记录课程包点击
     */
    @Override
    @Transactional
    public void recordPackageClick(String packageId) {
        boolean exists = builtinCourseLoader.isBuiltinPackage(packageId) || packageRepository.existsById(packageId);
        if (!exists) {
            throw new IllegalArgumentException("课程包不存在");
        }
        WordGamePackageClick click = clickRepository.findById(packageId)
                .orElse(WordGamePackageClick.builder().packageId(packageId).clickCount(0).build());
        click.setClickCount((click.getClickCount() == null ? 0 : click.getClickCount()) + 1);
        clickRepository.save(click);
    }

    /**
     * 获取课程包的课程列表
     */
    @Override
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getPackageCourses(Long userId, String packageId) {
        if (builtinCourseLoader.isBuiltinPackage(packageId)) {
            return builtinCourseLoader.loadBuiltinCourses();
        }
        WordGamePackage pkg = getVisiblePackage(userId, packageId);
        List<WordGameCourse> courses = courseRepository.findByPackageIdOrderByCourseIndexAsc(pkg.getId());
        List<Map<String, Object>> result = new ArrayList<>();
        for (WordGameCourse course : courses) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("index", course.getCourseIndex() + 1);
            item.put("title", course.getTitle());
            item.put("count", statementRepository.countByPackageIdAndCourseIndex(pkg.getId(), course.getCourseIndex()));
            result.add(item);
        }
        return result;
    }

    /**
     * 获取课程题目
     */
    @Override
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCourseQuestions(Long userId, Integer courseIndex, String packageId) {
        if (courseIndex == null || courseIndex < 1) {
            throw new IllegalArgumentException("无效的课程索引");
        }
        String targetPackageId = (packageId == null || packageId.isBlank()) 
                ? builtinCourseLoader.getBuiltinPackageId() : packageId;
        if (builtinCourseLoader.isBuiltinPackage(targetPackageId)) {
            return builtinCourseLoader.loadBuiltinCourseQuestions(courseIndex);
        }
        WordGamePackage pkg = getVisiblePackage(userId, targetPackageId);
        List<WordGameStatement> rows = statementRepository.findByPackageIdAndCourseIndexOrderBySortOrderAscIdAsc(
                pkg.getId(), courseIndex - 1);
        List<Map<String, Object>> result = new ArrayList<>();
        for (WordGameStatement row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("english", row.getEnglish());
            item.put("chinese", row.getChinese());
            item.put("soundmark", row.getSoundmark());
            result.add(item);
        }
        return result;
    }

    /**
     * 创建课程包
     */
    @Override
    @Transactional
    public Map<String, Object> createPackage(Long userId, Map<String, Object> body) {
        String name = WordGameUtils.trimString(body.get("name"));
        if (name.isBlank()) {
            throw new IllegalArgumentException("课程包名称不能为空");
        }
        String packageId = "up-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        WordGamePackage pkg = WordGamePackage.builder()
                .id(packageId)
                .userId(userId)
                .name(WordGameUtils.cut(name, 200))
                .description(WordGameUtils.cut(WordGameUtils.trimString(body.get("description")), 1000))
                .icon(WordGameUtils.cut(WordGameUtils.defaultIfBlank(
                        WordGameUtils.trimString(body.get("icon")), "📦"), 5000))
                .level(WordGameUtils.cut(WordGameUtils.defaultIfBlank(
                        WordGameUtils.trimString(body.get("level")), "自定义"), 50))
                .isPublic(WordGameUtils.asBoolean(body.get("isPublic")))
                .createdAt(LocalDateTime.now())
                .build();
        packageRepository.save(pkg);

        List<Map<String, Object>> sections = WordGameUtils.readSections(body);
        if (sections.isEmpty()) {
            sections = WordGameUtils.wrapLegacyStatements(body);
        }
        for (int i = 0; i < sections.size(); i++) {
            saveSection(packageId, i, sections.get(i));
        }
        return buildPackageMeta(pkg);
    }

    /**
     * 添加课程包章节
     */
    @Override
    @Transactional
    public Map<String, Object> addPackageSection(Long userId, String packageId, Map<String, Object> body) {
        WordGamePackage pkg = packageRepository.findById(packageId)
                .orElseThrow(() -> new IllegalArgumentException("课程包不存在"));
        if (!Objects.equals(pkg.getUserId(), userId)) {
            throw new IllegalArgumentException("课程包不存在或无权操作");
        }
        List<Map<String, Object>> statements = WordGameUtils.readStatements(body.get("statements"));
        if (statements.isEmpty()) {
            throw new IllegalArgumentException("至少需要一条题目");
        }
        int nextIndex = courseRepository.findFirstByPackageIdOrderByCourseIndexDesc(packageId)
                .map(c -> c.getCourseIndex() + 1)
                .orElse(0);
        Map<String, Object> section = new LinkedHashMap<>();
        section.put("title", body.get("title"));
        section.put("statements", statements);
        saveSection(packageId, nextIndex, section);
        return buildPackageMeta(pkg);
    }

    /**
     * 获取学习进度
     */
    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getProgress(Long userId, String packageId) {
        return progressTrackingService.getProgress(userId, packageId);
    }

    /**
     * 保存学习进度
     */
    @Override
    @Transactional
    public void saveProgress(Long userId, Map<String, Object> body) {
        progressTrackingService.saveProgress(userId, body);
    }

    /**
     * 迁移进度
     */
    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> migrateProgress(Long userId, Map<String, Object> body) {
        return progressTrackingService.migrateProgress(userId, body);
    }

    /**
     * 获取可见的课程包
     */
    private WordGamePackage getVisiblePackage(Long userId, String packageId) {
        WordGamePackage pkg = packageRepository.findById(packageId)
                .orElseThrow(() -> new IllegalArgumentException("课程包不存在"));
        if (!Boolean.TRUE.equals(pkg.getIsPublic()) && !Objects.equals(pkg.getUserId(), userId)) {
            throw new IllegalArgumentException("课程包不存在");
        }
        return pkg;
    }

    /**
     * 保存课程章节
     */
    private void saveSection(String packageId, int courseIndex, Map<String, Object> section) {
        String defaultTitle = builtinCourseLoader.toChineseTitle(courseIndex + 1);
        String title = WordGameUtils.cut(WordGameUtils.defaultIfBlank(
                WordGameUtils.trimString(section.get("title")), defaultTitle), 200);
        WordGameCourse course = WordGameCourse.builder()
                .packageId(packageId)
                .courseIndex(courseIndex)
                .title(title)
                .createdAt(LocalDateTime.now())
                .build();
        courseRepository.save(course);

        List<Map<String, Object>> statements = WordGameUtils.readStatements(section.get("statements"));
        int order = 0;
        for (Map<String, Object> statement : statements) {
            String english = WordGameUtils.cut(WordGameUtils.trimString(statement.get("english")), 2000);
            String chinese = WordGameUtils.cut(WordGameUtils.trimString(statement.get("chinese")), 2000);
            if (english.isBlank() && chinese.isBlank()) {
                continue;
            }
            WordGameStatement row = WordGameStatement.builder()
                    .packageId(packageId)
                    .courseIndex(courseIndex)
                    .sortOrder(order++)
                    .english(english)
                    .chinese(chinese)
                    .soundmark(WordGameUtils.cut(WordGameUtils.trimString(statement.get("soundmark")), 200))
                    .build();
            statementRepository.save(row);
        }
    }

    /**
     * 构建课程包元数据
     */
    private Map<String, Object> buildPackageMeta(WordGamePackage pkg) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", pkg.getId());
        item.put("name", pkg.getName());
        item.put("description", pkg.getDescription());
        item.put("icon", pkg.getIcon());
        item.put("level", pkg.getLevel());
        item.put("courseCount", courseRepository.findByPackageIdOrderByCourseIndexAsc(pkg.getId()).size());
        item.put("totalQuestions", statementRepository.countByPackageId(pkg.getId()));
        item.put("isUserPackage", true);
        item.put("isPublic", Boolean.TRUE.equals(pkg.getIsPublic()));
        item.put("clickCount", getClickCount(pkg.getId()));
        return item;
    }

    /**
     * 获取点击数
     */
    private int getClickCount(String packageId) {
        return clickRepository.findById(packageId)
                .map(WordGamePackageClick::getClickCount)
                .orElse(0);
    }
}
