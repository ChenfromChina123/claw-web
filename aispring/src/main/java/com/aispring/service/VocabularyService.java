package com.aispring.service;

import com.aispring.common.CacheConstants;
import com.aispring.common.DateTimeConstants;
import com.aispring.entity.*;
import com.aispring.exception.CustomException;
import com.aispring.repository.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 词汇学习服务
 * 对应Python: language_learning.py中的词汇相关功能
 */
@Service
@Slf4j
public class VocabularyService {

    // 构造函数自动注入
    public VocabularyService(VocabularyListRepository vocabularyListRepository,
                           VocabularyWordRepository vocabularyWordRepository,
                           UserWordProgressRepository userWordProgressRepository,
                           PublicVocabularyWordRepository publicVocabularyWordRepository,
                           UserLearningRecordRepository userLearningRecordRepository,
                           AiChatService aiChatService,
                           GeneratedArticleRepository generatedArticleRepository,
                           ArticleUsedWordRepository articleUsedWordRepository,
                           ObjectMapper objectMapper,
                           RedisTemplate<String, Object> redisTemplate) {
        this.vocabularyListRepository = vocabularyListRepository;
        this.vocabularyWordRepository = vocabularyWordRepository;
        this.userWordProgressRepository = userWordProgressRepository;
        this.publicVocabularyWordRepository = publicVocabularyWordRepository;
        this.userLearningRecordRepository = userLearningRecordRepository;
        this.aiChatService = aiChatService;
        this.generatedArticleRepository = generatedArticleRepository;
        this.articleUsedWordRepository = articleUsedWordRepository;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
    }

    private final VocabularyListRepository vocabularyListRepository;
    private final VocabularyWordRepository vocabularyWordRepository;
    private final UserWordProgressRepository userWordProgressRepository;
    private final PublicVocabularyWordRepository publicVocabularyWordRepository;
    private final UserLearningRecordRepository userLearningRecordRepository;
    private final AiChatService aiChatService;
    private final GeneratedArticleRepository generatedArticleRepository;
    private final ArticleUsedWordRepository articleUsedWordRepository;
    private final ObjectMapper objectMapper;
    private final RedisTemplate<String, Object> redisTemplate;

    private static final Duration CACHE_DURATION = Duration.ofHours(CacheConstants.CACHE_DURATION_HOURS);

    /**
     * 创建单词表
     */
    @Transactional
    public VocabularyList createVocabularyList(Long userId, String name, String description, String language) {
        VocabularyList list = VocabularyList.builder()
            .name(name)
            .description(description)
            .language(language != null ? language : "en")
            .isPreset(false)
            .isPublic(false)
            .createdBy(userId)
            .build();

        return vocabularyListRepository.save(list);
    }

    /**
     * 获取用户的单词表列表
     */
    public List<VocabularyList> getUserVocabularyLists(Long userId) {
        List<VocabularyList> lists = vocabularyListRepository.findByUserIdOrPublic(userId);
        // 填充单词数量
        for (VocabularyList list : lists) {
            long count = vocabularyWordRepository.countByVocabularyListId(list.getId());
            list.setWordCount(count);
        }
        return lists;
    }

    /**
     * 添加单词到单词表
     */
    @Transactional
    public VocabularyWord addWordToList(Integer vocabularyListId, String word, String definition,
                                        String partOfSpeech, String example, String language) {
        VocabularyWord vocabularyWord = VocabularyWord.builder()
            .vocabularyListId(vocabularyListId)
            .word(word)
            .definition(definition)
            .partOfSpeech(partOfSpeech)
            .example(example)
            .language(language != null ? language : "en")
            .build();

        return vocabularyWordRepository.save(vocabularyWord);
    }

    /**
     * 获取单词表中的所有单词
     */
    public List<VocabularyWord> getWordsInList(Integer vocabularyListId) {
        return vocabularyWordRepository.findByVocabularyListIdOrderByCreatedAtDesc(vocabularyListId);
    }

    /**
     * 删除单词表
     */
    @Transactional
    public void deleteVocabularyList(Integer listId) {
        vocabularyListRepository.deleteById(listId);
    }

    /**
     * 删除单词
     */
    @Transactional
    public void deleteWord(Integer wordId) {
        vocabularyWordRepository.deleteById(wordId);
    }

    /**
     * 更新用户单词进度
     */
    @Transactional
    public UserWordProgress updateUserWordProgress(Long userId, Integer wordId, Integer masteryLevel, Boolean isDifficult) {
        Optional<UserWordProgress> existingProgress = userWordProgressRepository.findByUserIdAndWordId(userId, wordId);

        UserWordProgress progress;
        if (existingProgress.isPresent()) {
            progress = existingProgress.get();
            if (masteryLevel != null) {
                progress.setMasteryLevel(masteryLevel);
            }
            if (isDifficult != null) {
                progress.setIsDifficult(isDifficult);
            }
            progress.setLastReviewed(LocalDateTime.now());
            progress.setReviewCount(progress.getReviewCount() + 1);

            // 计算下次复习时间（简单的间隔重复算法）
            int daysToAdd = calculateNextReviewDays(progress.getMasteryLevel());
            progress.setNextReviewDate(LocalDateTime.now().plusDays(daysToAdd));
        } else {
            progress = UserWordProgress.builder()
                .userId(userId)
                .wordId(wordId)
                .masteryLevel(masteryLevel != null ? masteryLevel : 0)
                .isDifficult(isDifficult != null ? isDifficult : false)
                .lastReviewed(LocalDateTime.now())
                .reviewCount(1)
                .nextReviewDate(LocalDateTime.now().plusDays(1))
                .build();
        }

        return userWordProgressRepository.save(progress);
    }

    /**
     * 计算下次复习天数（间隔重复算法）
     */
    private int calculateNextReviewDays(int masteryLevel) {
        return switch (masteryLevel) {
            case 0 -> 1;   // 不熟悉，1天后复习
            case 1 -> 3;   // 稍微熟悉，3天后复习
            case 2 -> 7;   // 比较熟悉，7天后复习
            case 3 -> 14;  // 熟悉，14天后复习
            case 4 -> 30;  // 很熟悉，30天后复习
            case 5 -> 90;  // 完全掌握，90天后复习
            default -> 1;
        };
    }

    /**
     * 获取用户需要复习的单词
     */
    public List<UserWordProgress> getUserReviewWords(Long userId) {
        return userWordProgressRepository.findDueForReview(userId, LocalDateTime.now());
    }

    public List<UserWordProgress> getUserProgressForList(Long userId, Integer listId) {
        return userWordProgressRepository.findByUserIdAndVocabularyListId(userId, listId);
    }

    /**
     * 获取用户的学习统计
     */
    public LearningStats getUserLearningStats(Long userId) {
        long totalWords = userWordProgressRepository.countByUserId(userId);
        long masteredWords = userWordProgressRepository.countMasteredWords(userId);
        long totalDuration = userLearningRecordRepository.getTotalDuration(userId);
        long todayDuration = userLearningRecordRepository.getTodayDuration(userId);

        return new LearningStats(totalWords, masteredWords, totalDuration, todayDuration);
    }

    /**
     * 学习统计数据类
     */
    public record LearningStats(long totalWords, long masteredWords, long totalDuration, long todayDuration) {}

    /**
     * 记录学习活动
     */
    @Transactional
    public void recordLearningActivity(Long userId, String activityType, String activityDetails, Integer duration) {
        UserLearningRecord record = UserLearningRecord.builder()
            .userId(userId)
            .activityType(activityType)
            .activityDetails(activityDetails)
            .duration(duration)
            .build();

        userLearningRecordRepository.save(record);
    }

    /**
     * 从公共词库查找单词
     */
    public Optional<PublicVocabularyWord> findPublicWord(String word, String language) {
        if (word == null || word.isBlank() || language == null || language.isBlank()) {
            return Optional.empty();
        }

        // 生成缓存键
        String cacheKey = CacheConstants.PUBLIC_WORD_CACHE_PREFIX + language + ":" + word.toLowerCase();

        try {
            // 尝试从缓存获取
            Object cachedWord = redisTemplate.opsForValue().get(cacheKey);
            if (cachedWord instanceof PublicVocabularyWord) {
                return Optional.of((PublicVocabularyWord) cachedWord);
            }
        } catch (Exception e) {
            log.warn("Redis cache error when getting public word: {}", e.getMessage());
            // 缓存错误时继续从数据库查询
        }

        // 从数据库查询
        Optional<PublicVocabularyWord> wordOpt = publicVocabularyWordRepository.findByWordAndLanguage(word, language);

        // 缓存结果
        wordOpt.ifPresent(wordObj -> {
            try {
                redisTemplate.opsForValue().set(cacheKey, wordObj, CACHE_DURATION);
            } catch (Exception e) {
                log.warn("Redis cache error when setting public word: {}", e.getMessage());
            }
        });

        return wordOpt;
    }

    /**
     * 搜索公共词库
     */
    public List<PublicVocabularyWord> searchPublicWords(String keyword, String language) {
        String safeKeyword = keyword == null ? "" : keyword.trim();
        String safeLanguage = language == null ? "en" : language.trim();

        // 生成缓存键
        String cacheKey = CacheConstants.PUBLIC_WORDS_SEARCH_CACHE_PREFIX + safeLanguage + ":" + safeKeyword;

        try {
            // 尝试从缓存获取
            Object cachedResult = redisTemplate.opsForValue().get(cacheKey);
            if (cachedResult instanceof List) {
                @SuppressWarnings("unchecked")
                List<PublicVocabularyWord> cachedWords = (List<PublicVocabularyWord>) cachedResult;
                return cachedWords;
            }
        } catch (Exception e) {
            log.warn("Redis cache error when getting search results: {}", e.getMessage());
            // 缓存错误时继续从数据库查询
        }

        // 从数据库查询
        List<PublicVocabularyWord> words = publicVocabularyWordRepository.searchByKeyword(safeLanguage, safeKeyword);

        // 缓存结果
        try {
            redisTemplate.opsForValue().set(cacheKey, words, CACHE_DURATION);
        } catch (Exception e) {
            log.warn("Redis cache error when setting search results: {}", e.getMessage());
        }

        return words;
    }

    public PublicSearchResult searchPublicWordsPaged(String keyword, String language, Integer page, Integer size) {
        int safePage = page == null ? 1 : Math.max(1, page);
        int safeSize = size == null ? 50 : Math.min(Math.max(1, size), 200);

        String kw = keyword == null ? "" : keyword.trim();
        String lang = (language == null || language.isBlank()) ? "en" : language.trim();

        // 生成缓存键
        String cacheKey = CacheConstants.PUBLIC_WORDS_SEARCH_CACHE_PREFIX + lang + ":" + kw + ":page:" + safePage + ":size:" + safeSize;

        try {
            // 尝试从缓存获取
            Object cachedResult = redisTemplate.opsForValue().get(cacheKey);
            if (cachedResult instanceof PublicSearchResult) {
                return (PublicSearchResult) cachedResult;
            }
        } catch (Exception e) {
            log.warn("Redis cache error when getting paged search results: {}", e.getMessage());
            // 缓存错误时继续从数据库查询
        }

        PageRequest pageable = PageRequest.of(safePage - 1, safeSize);
        Page<PublicVocabularyWord> result;
        if (kw.isEmpty()) {
            result = publicVocabularyWordRepository.findByLanguageOrderByUsageCountDesc(lang, pageable);
        } else {
            result = publicVocabularyWordRepository.searchByKeywordPaged(lang, kw, pageable);
        }

        PublicSearchResult searchResult = new PublicSearchResult(result.getContent(), result.getTotalElements(), safePage, safeSize);

        // 缓存结果
        try {
            redisTemplate.opsForValue().set(cacheKey, searchResult, CACHE_DURATION);
        } catch (Exception e) {
            log.warn("Redis cache error when setting paged search results: {}", e.getMessage());
        }

        return searchResult;
    }

    public record PublicSearchResult(List<PublicVocabularyWord> words, long total, int page, int size) {}

    public record ArticleWordLibraryItem(Integer wordId,
                                         String word,
                                         String category,
                                         String explain,
                                         String createTime,
                                         String libraryType) {}

    public record ArticleWordLibraryResult(long total, List<ArticleWordLibraryItem> list, int pageNum, int pageSize) {}

    public record ArticleHistoryResult(long total, List<GeneratedArticle> list, int pageNum, int pageSize) {}

    @Transactional(readOnly = true)
    public ArticleWordLibraryResult getArticleWordLibrary(Long userId, String libraryType, String keyword, String category,
                                                          Integer pageNum, Integer pageSize, String language) {
        int safePage = pageNum == null ? 1 : Math.max(1, pageNum);
        int safeSize = pageSize == null ? 20 : Math.min(Math.max(1, pageSize), 100);
        String type = libraryType == null ? "mine" : libraryType.trim().toLowerCase(Locale.ROOT);
        String safeKeyword = keyword == null ? "" : keyword.trim();
        String safeCategory = category == null ? "" : category.trim();
        String safeLanguage = language == null ? "" : language.trim();
        Pageable pageable = PageRequest.of(safePage - 1, safeSize);

        if ("public".equals(type)) {
            Page<PublicVocabularyWord> page = publicVocabularyWordRepository.searchForArticleWordLibrary(
                safeLanguage, safeKeyword, safeCategory, pageable
            );
            List<ArticleWordLibraryItem> list = page.getContent().stream()
                .map(word -> new ArticleWordLibraryItem(
                    word.getId(),
                    word.getWord(),
                    word.getTag(),
                    word.getDefinition(),
                    word.getCreatedAt() == null ? null : word.getCreatedAt().format(DateTimeConstants.DATETIME_FORMATTER),
                    "public"
                ))
                .toList();
            return new ArticleWordLibraryResult(page.getTotalElements(), list, safePage, safeSize);
        }

        Page<VocabularyWord> page = vocabularyWordRepository.searchMineWords(userId, safeKeyword, safeCategory, pageable);
        List<ArticleWordLibraryItem> list = page.getContent().stream()
            .map(word -> new ArticleWordLibraryItem(
                word.getId(),
                word.getWord(),
                word.getPartOfSpeech(),
                word.getDefinition(),
                word.getCreatedAt() == null ? null : word.getCreatedAt().format(DateTimeConstants.DATETIME_FORMATTER),
                "mine"
            ))
            .toList();
        return new ArticleWordLibraryResult(page.getTotalElements(), list, safePage, safeSize);
    }

    /**
     * 生成文章主题建议
     */
    public List<String> generateArticleTopics(List<String> words, String language) {
        if (words == null || words.isEmpty()) {
            throw new CustomException("请先选择至少1个单词");
        }
        if (words.size() > 20) {
            throw new CustomException("单次最多选择20个单词");
        }
        String wordsStr = String.join(", ", words);
        String prompt = String.format(
            "我有以下单词列表：[%s]。目标语言是%s。请建议 5 个简短的文章主题。 " +
            "仅返回一个 JSON 字符串数组，例如：[\"主题1\", \"主题2\"]。不要包含任何 Markdown 格式或代码块标记。",
            wordsStr, language == null ? "英语" : language
        );

        // 使用新的 ask 方法签名，不传入 model 参数，默认使用 deepseek-v3
        String response = aiChatService.ask(prompt, null, "deepseek-v3", null, null);
        if (response == null) return new ArrayList<>();

        // Clean response (remove markdown code blocks if any)
        String json = response.replaceAll("```json", "").replaceAll("```", "").trim();

        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>(){});
        } catch (Exception e) {
            System.err.println("Failed to parse topics JSON: " + e.getMessage());
            // Fallback to splitting if JSON parsing fails
            return Arrays.stream(response.split("[,，\n]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .filter(s -> !s.startsWith("[")) // Remove JSON brackets if split
                .filter(s -> !s.endsWith("]"))
                .limit(6)
                .collect(Collectors.toList());
        }
    }

    /**
     * 生成并保存文章
     */
    @Transactional
    public GeneratedArticle generateAndSaveArticle(Long userId, Integer listId, List<Integer> wordIds,
                                                   String topic, String difficulty, String length) {
        return generateAndSaveArticle(userId, listId, wordIds, topic, difficulty, length, "en");
    }

    @Transactional
    public GeneratedArticle generateAndSaveArticle(Long userId, Integer listId, List<Integer> wordIds,
                                                   String topic, String difficulty, String length, String targetLanguage) {
        if (wordIds == null || wordIds.isEmpty()) {
            throw new CustomException("请先选择至少1个单词");
        }
        if (wordIds.size() > 20) {
            throw new CustomException("单次最多选择20个单词");
        }
        String normalizedLanguage = normalizeTargetLanguage(targetLanguage);
        List<VocabularyWord> words = vocabularyWordRepository.findByIdIn(wordIds);
        if (words.isEmpty()) {
            throw new CustomException("未找到可用单词");
        }
        List<String> selectedWords = words.stream()
            .map(VocabularyWord::getWord)
            .toList();
        return generateAndSaveArticleByWordTexts(userId, listId, wordIds, selectedWords, topic, difficulty, length, normalizedLanguage);
    }

    @Transactional
    public GeneratedArticle generateAndSaveArticleByWordTexts(Long userId, Integer listId, List<Integer> wordIds,
                                                              List<String> selectedWords, String topic,
                                                              String difficulty, String length, String targetLanguage) {
        if (selectedWords == null || selectedWords.isEmpty()) {
            throw new CustomException("请先选择至少1个单词");
        }
        if (selectedWords.size() > 20) {
            throw new CustomException("单次最多选择20个单词");
        }
        String normalizedLanguage = normalizeTargetLanguage(targetLanguage);
        String finalTopic = normalizeTopic(topic);
        if (finalTopic == null) {
            finalTopic = generateAutoTopicByWords(selectedWords, userId);
        }
        if (finalTopic.length() > 200) {
            throw new CustomException("文章主题最多200个字符");
        }
        String normalizedLength = normalizeLengthType(length);
        String normalizedDifficulty = normalizeDifficulty(difficulty);
        String vocabularyList = String.join(", ", selectedWords);
        int targetWords = lengthToTargetWords(length);
        String languageName = mapLanguageName(normalizedLanguage);
        String prompt = String.format(
            "请写一篇关于“%s”的%s文章（约 %d 词，难度：%s）。 " +
            "必须包含以下单词：%s。 " +
            "文章内容必须围绕主题展开。 " +
            "直接返回文章内容，不要包含任何前言或后语（如“好的，这是文章...”）。 " +
            "如果文章包含标题，请以 'Title: ' 开头放在第一行。",
            finalTopic, languageName, targetWords, normalizedDifficulty, vocabularyList
        );
        String content = aiChatService.ask(prompt, null, "deepseek-v3", userId, null);
        if (content != null) {
            content = content.replaceAll("```markdown", "").replaceAll("```", "").trim();
            if (content.startsWith("Title:")) {
                content = content.substring(content.indexOf("\n") + 1).trim();
            }
        }
        if (content == null || content.isBlank()) {
            throw new CustomException("文章生成失败，请稍后重试");
        }
        String translated = translateArticleToChinese(content, userId);
        LocalDateTime now = LocalDateTime.now();
        GeneratedArticle article = GeneratedArticle.builder()
            .userId(userId)
            .vocabularyListId(listId)
            .topic(finalTopic)
            .difficultyLevel(normalizedDifficulty)
            .articleLength(normalizedLength)
            .targetLanguage(normalizedLanguage)
            .originalText(content)
            .translatedText(translated)
            .wordCount(countWords(content))
            .createdAt(now)
            .updatedAt(now)
            .isDeleted(false)
            .build();
        try {
            if (wordIds != null && !wordIds.isEmpty()) {
                article.setUsedWordIds(objectMapper.writeValueAsString(wordIds));
            } else {
                article.setUsedWordIds(objectMapper.writeValueAsString(selectedWords));
            }
        } catch (Exception e) {
            article.setUsedWordIds("[]");
        }
        article = generatedArticleRepository.save(article);
        List<ArticleUsedWord> usedWords = new ArrayList<>();
        List<VocabularyWord> matchedWords = wordIds == null || wordIds.isEmpty()
            ? List.of()
            : vocabularyWordRepository.findByIdIn(wordIds);
        for (String selectedWord : selectedWords) {
            VocabularyWord matched = matchedWords.stream()
                .filter(item -> item.getWord() != null && item.getWord().equalsIgnoreCase(selectedWord))
                .findFirst()
                .orElse(null);
            int occurrences = countOccurrencesIgnoreCase(content, selectedWord);
            ArticleUsedWord usedWord = ArticleUsedWord.builder()
                .articleId(article.getId())
                .wordId(matched == null ? null : matched.getId())
                .wordText(selectedWord)
                .occurrenceCount(occurrences)
                .word(matched)
                .build();
            usedWords.add(articleUsedWordRepository.save(usedWord));
        }
        article.setUsedWords(usedWords);
        return article;
    }

    private int countOccurrencesIgnoreCase(String text, String word) {
        if (text == null || text.isBlank() || word == null || word.isBlank()) return 0;
        String w = word.trim();
        Pattern pattern = Pattern.compile("\\b" + Pattern.quote(w) + "\\b", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);
        int count = 0;
        while (matcher.find()) {
            count += 1;
        }
        return count;
    }

    /**
     * 将文章长度枚举映射为目标词数
     */
    private int lengthToTargetWords(String length) {
        String normalized = normalizeLengthType(length);
        return switch (normalized) {
            case "short" -> 150;
            case "long" -> 900;
            default -> 400;
        };
    }

    /**
     * 规范化主题：空字符串视为无主题
     */
    private String normalizeTopic(String topic) {
        if (topic == null) return null;
        String t = topic.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * 在用户未填写主题时自动生成一个中文主题
     */
    private String generateAutoTopic(List<VocabularyWord> words, Long userId) {
        String wordsStr = words.stream()
            .map(VocabularyWord::getWord)
            .limit(20)
            .collect(Collectors.joining(", "));
        String prompt = String.format(
            "根据这些英文单词：[%s]，提供一个简短的中文文章标题（不超过 8 个汉字）。 " +
            "仅返回标题文本。不要添加引号或任何 Markdown 格式。",
            wordsStr
        );
        String response = aiChatService.ask(prompt, null, "deepseek-v3", userId, null);
        if (response == null) return "学习文章";
        String cleaned = response.replaceAll("```", "").trim();
        cleaned = cleaned.replaceAll("^\"|\"$", "");
        return cleaned.isBlank() ? "学习文章" : cleaned;
    }

    private String generateAutoTopicByWords(List<String> words, Long userId) {
        String wordsStr = words.stream()
            .limit(20)
            .collect(Collectors.joining(", "));
        String prompt = String.format(
            "根据这些单词：[%s]，提供一个简短的文章标题（不超过 20 个字符）。仅返回标题文本。",
            wordsStr
        );
        String response = aiChatService.ask(prompt, null, "deepseek-v3", userId, null);
        if (response == null) return "学习文章";
        String cleaned = response.replaceAll("```", "").trim();
        cleaned = cleaned.replaceAll("^\"|\"$", "");
        return cleaned.isBlank() ? "学习文章" : cleaned;
    }

    /**
     * 将英文文章翻译为中文，并尽量保持段落结构一致
     */
    private String translateArticleToChinese(String content, Long userId) {
        if (content == null || content.isBlank()) return null;
        String prompt = "将以下英文文章翻译成中文。 " +
            "保持段落数量和空行与原文完全一致。 " +
            "不要包含任何 Markdown 格式。不要包含 ** 标记，保持单词为普通文本。 " +
            "仅返回中文翻译文本。\n\n" +
            content;
        String response = aiChatService.ask(prompt, null, "deepseek-v3", userId, null);
        if (response == null) return null;
        String cleaned = response.replaceAll("```markdown", "").replaceAll("```", "").trim();
        cleaned = cleaned.replace("**", "");
        return cleaned.isBlank() ? null : cleaned;
    }

    /**
     * 获取用户生成的文章列表
     */
    @Transactional(readOnly = true)
    public List<GeneratedArticle> getUserGeneratedArticles(Long userId) {
        return generatedArticleRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public ArticleHistoryResult getUserGeneratedArticles(Long userId, String keyword, String targetLanguage,
                                                         LocalDateTime startTime, LocalDateTime endTime,
                                                         Integer pageNum, Integer pageSize) {
        int safePage = pageNum == null ? 1 : Math.max(1, pageNum);
        int safeSize = pageSize == null ? 10 : Math.min(Math.max(1, pageSize), 100);
        Page<GeneratedArticle> page = generatedArticleRepository.searchByUserWithFilters(
            userId,
            keyword == null ? "" : keyword.trim(),
            targetLanguage == null ? "" : targetLanguage.trim(),
            startTime,
            endTime,
            PageRequest.of(safePage - 1, safeSize)
        );
        page.getContent().forEach(article -> article.setUsedWords(List.of()));
        return new ArticleHistoryResult(page.getTotalElements(), page.getContent(), safePage, safeSize);
    }

    /**
     * 获取文章详情
     */
    @Transactional(readOnly = true)
    public GeneratedArticle getGeneratedArticle(Integer articleId) {
        GeneratedArticle article = generatedArticleRepository.findById(articleId)
            .orElseThrow(() -> new CustomException("文章不存在"));

        // 填充使用的单词信息（如果需要详细信息）
        List<ArticleUsedWord> usedWords = articleUsedWordRepository.findByArticleIdWithWord(articleId);
        article.setUsedWords(usedWords);

        return article;
    }

    @Transactional(readOnly = true)
    public GeneratedArticle getGeneratedArticle(Integer articleId, Long userId) {
        GeneratedArticle article = generatedArticleRepository.findByIdAndUserId(articleId, userId)
            .orElseThrow(() -> new CustomException("文章不存在或无权限访问"));
        List<ArticleUsedWord> usedWords = articleUsedWordRepository.findByArticleIdWithWord(articleId);
        article.setUsedWords(usedWords);
        return article;
    }

    @Transactional
    public int deleteUserGeneratedArticles(Long userId, List<Integer> articleIds) {
        if (articleIds == null || articleIds.isEmpty()) {
            return 0;
        }
        return generatedArticleRepository.softDeleteByUserAndIds(userId, articleIds);
    }

    @Transactional
    public int clearUserGeneratedArticles(Long userId) {
        return generatedArticleRepository.softDeleteAllByUser(userId);
    }

    private String normalizeTargetLanguage(String targetLanguage) {
        if (targetLanguage == null || targetLanguage.isBlank()) {
            return "en";
        }
        String value = targetLanguage.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "zh", "en", "jp", "kr", "fr", "es" -> value;
            default -> throw new CustomException("不支持的目标语言");
        };
    }

    private String mapLanguageName(String targetLanguage) {
        return switch (targetLanguage) {
            case "zh" -> "中文";
            case "jp" -> "日语";
            case "kr" -> "韩语";
            case "fr" -> "法语";
            case "es" -> "西班牙语";
            default -> "英语";
        };
    }

    private String normalizeLengthType(String length) {
        if (length == null || length.isBlank()) {
            return "medium";
        }
        String value = length.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "short", "medium", "long" -> value;
            default -> switch (length.trim()) {
                case "Short" -> "short";
                case "Medium" -> "medium";
                case "Long" -> "long";
                default -> throw new CustomException("文章长度参数不合法");
            };
        };
    }

    private String normalizeDifficulty(String difficulty) {
        if (difficulty == null || difficulty.isBlank()) {
            return "中等";
        }
        return difficulty.trim();
    }

    private int countWords(String content) {
        if (content == null || content.isBlank()) {
            return 0;
        }
        String cleaned = content.replaceAll("\\s+", " ").trim();
        if (cleaned.isEmpty()) {
            return 0;
        }
        return cleaned.split(" ").length;
    }

    public byte[] renderPdfFromHtml(String html) {
        if (html == null || html.isBlank()) {
            throw new CustomException("PDF内容为空");
        }
        try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            Class<?> builderClass = Class.forName("com.openhtmltopdf.pdfboxout.PdfRendererBuilder");
            Object builder = builderClass.getDeclaredConstructor().newInstance();

            invokeMethod(builder, builderClass, "useFastMode");
            invokeMethod(builder, builderClass, "withHtmlContent", String.class, String.class, html, null);
            registerPdfFonts(builder, builderClass);
            invokeMethod(builder, builderClass, "toStream", OutputStream.class, outputStream);
            invokeMethod(builder, builderClass, "run");

            return outputStream.toByteArray();
        } catch (ClassNotFoundException e) {
            throw new CustomException("生成PDF失败: 缺少PDF渲染组件(openhtmltopdf-pdfbox)，请联系管理员处理");
        } catch (Exception e) {
            throw new CustomException("生成PDF失败: " + e.getMessage());
        }
    }

    private void registerPdfFonts(Object builder, Class<?> builderClass) {
        // 优先使用 SimHei (黑体)，因为它是标准的 ttf 文件，兼容性最好
        tryUseFont(builder, builderClass, "C:/Windows/Fonts/simhei.ttf", "SimHei");
        // 备选方案：微软雅黑系列
        tryUseFont(builder, builderClass, "C:/Windows/Fonts/msyh.ttf", "Microsoft YaHei");
        tryUseFont(builder, builderClass, "C:/Windows/Fonts/msyh.ttc", "Microsoft YaHei");
        tryUseFont(builder, builderClass, "C:/Windows/Fonts/msyhbd.ttf", "Microsoft YaHei");
        tryUseFont(builder, builderClass, "C:/Windows/Fonts/msyhbd.ttc", "Microsoft YaHei");
        // 备选方案：宋体
        tryUseFont(builder, builderClass, "C:/Windows/Fonts/simsun.ttc", "SimSun");
        // 备选方案：Arial Unicode MS
        tryUseFont(builder, builderClass, "C:/Windows/Fonts/arialuni.ttf", "Arial Unicode MS");
    }

    private void tryUseFont(Object builder, Class<?> builderClass, String fontPath, String fontFamily) {
        try {
            File fontFile = new File(fontPath);
            if (!fontFile.exists() || !fontFile.isFile()) {
                return;
            }
            // 使用反射调用以增强兼容性 (针对 openhtmltopdf)
            invokeMethod(builder, builderClass, "useFont", File.class, String.class, fontFile, fontFamily);
            log.info("Successfully registered PDF font: {} from {}", fontFamily, fontPath);
        } catch (Exception e) {
            log.warn("Failed to register PDF font {}: {}", fontFamily, e.getMessage());
        }
    }

    private void invokeMethod(Object target, Class<?> targetClass, String methodName, Class<?> p1, Object a1) throws Exception {
        Method m = targetClass.getMethod(methodName, p1);
        m.invoke(target, a1);
    }

    private void invokeMethod(Object target, Class<?> targetClass, String methodName, Class<?> p1, Class<?> p2, Object a1, Object a2) throws Exception {
        Method m = targetClass.getMethod(methodName, p1, p2);
        m.invoke(target, a1, a2);
    }

    private void invokeMethod(Object target, Class<?> targetClass, String methodName) throws Exception {
        Method m = targetClass.getMethod(methodName);
        m.invoke(target);
    }
}
