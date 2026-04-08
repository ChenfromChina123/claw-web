package com.aispring.service;

import com.aispring.entity.PublicVocabularyWord;
import com.aispring.repository.PublicVocabularyWordRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class VocabularyServiceCacheTest {

    @Mock
    private PublicVocabularyWordRepository publicVocabularyWordRepository;

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @InjectMocks
    private VocabularyService vocabularyService;

    private PublicVocabularyWord testWord;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        
        // 模拟 RedisTemplate 的 opsForValue 方法
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        
        // 创建测试单词
        testWord = new PublicVocabularyWord();
        testWord.setId(1);
        testWord.setWord("test");
        testWord.setLanguage("en");
        testWord.setDefinition("A test word");
        testWord.setCreatedAt(LocalDateTime.now());
    }

    @Test
    void testFindPublicWordWithCacheHit() {
        // 模拟缓存命中
        when(valueOperations.get("public_word:en:test")).thenReturn(testWord);
        
        // 调用方法
        Optional<PublicVocabularyWord> result = vocabularyService.findPublicWord("test", "en");
        
        // 验证结果
        assertTrue(result.isPresent());
        assertEquals("test", result.get().getWord());
        
        // 验证缓存被使用，数据库未被查询
        verify(publicVocabularyWordRepository, never()).findByWordAndLanguage(anyString(), anyString());
        verify(valueOperations, times(1)).get("public_word:en:test");
    }

    @Test
    void testFindPublicWordWithCacheMiss() {
        // 模拟缓存未命中
        when(valueOperations.get("public_word:en:test")).thenReturn(null);
        // 模拟数据库查询
        when(publicVocabularyWordRepository.findByWordAndLanguage("test", "en")).thenReturn(Optional.of(testWord));
        
        // 调用方法
        Optional<PublicVocabularyWord> result = vocabularyService.findPublicWord("test", "en");
        
        // 验证结果
        assertTrue(result.isPresent());
        assertEquals("test", result.get().getWord());
        
        // 验证缓存被设置
        verify(publicVocabularyWordRepository, times(1)).findByWordAndLanguage("test", "en");
        verify(valueOperations, times(1)).set(anyString(), eq(testWord), any());
    }

    @Test
    void testFindPublicWordWithRedisError() {
        // 模拟 Redis 错误
        when(valueOperations.get("public_word:en:test")).thenThrow(new RuntimeException("Redis error"));
        // 模拟数据库查询
        when(publicVocabularyWordRepository.findByWordAndLanguage("test", "en")).thenReturn(Optional.of(testWord));
        
        // 调用方法，应该仍然正常返回
        Optional<PublicVocabularyWord> result = vocabularyService.findPublicWord("test", "en");
        
        // 验证结果
        assertTrue(result.isPresent());
        assertEquals("test", result.get().getWord());
        
        // 验证数据库被查询
        verify(publicVocabularyWordRepository, times(1)).findByWordAndLanguage("test", "en");
    }
}
