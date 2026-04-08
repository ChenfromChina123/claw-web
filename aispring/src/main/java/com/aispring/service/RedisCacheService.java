package com.aispring.service;

import com.aispring.common.CacheConstants;
import com.aispring.entity.ChatRecord;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Redis缓存服务
 * 用于缓存聊天消息等热点数据
 * 当 Redis 不可用时，优雅降级，不影响主流程
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RedisCacheService {

    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    private static final Duration CACHE_DURATION = Duration.ofHours(CacheConstants.CACHE_DURATION_HOURS);
    
    private volatile boolean redisAvailable = true;

    /**
     * 缓存会话消息
     */
    public void cacheSessionMessages(String sessionId, Map<String, Object> messages) {
        if (!redisAvailable) return;
        try {
            String key = CacheConstants.MESSAGES_CACHE_PREFIX + sessionId;
            String value = objectMapper.writeValueAsString(messages);
            redisTemplate.opsForValue().set(key, value, CACHE_DURATION);
        } catch (JsonProcessingException e) {
            log.debug("序列化失败，跳过缓存: {}", e.getMessage());
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，跳过缓存");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("缓存失败，跳过: {}", e.getMessage());
        }
    }

    /**
     * 获取缓存的会话消息
     */
    public Map<String, Object> getCachedSessionMessages(String sessionId) {
        if (!redisAvailable) return null;
        try {
            String key = CacheConstants.MESSAGES_CACHE_PREFIX + sessionId;
            String value = redisTemplate.opsForValue().get(key);
            if (value != null) {
                return objectMapper.readValue(value, Map.class);
            }
        } catch (JsonProcessingException e) {
            log.debug("反序列化失败，返回null: {}", e.getMessage());
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，返回null");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("获取缓存失败，返回null: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 删除会话消息缓存
     */
    public void deleteSessionMessagesCache(String sessionId) {
        if (!redisAvailable) return;
        try {
            String key = CacheConstants.MESSAGES_CACHE_PREFIX + sessionId;
            redisTemplate.delete(key);
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，跳过删除");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("删除缓存失败，跳过: {}", e.getMessage());
        }
    }

    /**
     * 缓存会话信息
     */
    public void cacheSessionInfo(String sessionId, Map<String, Object> sessionInfo) {
        if (!redisAvailable) return;
        try {
            String key = CacheConstants.SESSION_CACHE_PREFIX + sessionId;
            String value = objectMapper.writeValueAsString(sessionInfo);
            redisTemplate.opsForValue().set(key, value, CACHE_DURATION);
        } catch (JsonProcessingException e) {
            log.debug("序列化失败，跳过缓存: {}", e.getMessage());
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，跳过缓存");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("缓存失败，跳过: {}", e.getMessage());
        }
    }

    /**
     * 获取缓存的会话信息
     */
    public Map<String, Object> getCachedSessionInfo(String sessionId) {
        if (!redisAvailable) return null;
        try {
            String key = CacheConstants.SESSION_CACHE_PREFIX + sessionId;
            String value = redisTemplate.opsForValue().get(key);
            if (value != null) {
                return objectMapper.readValue(value, Map.class);
            }
        } catch (JsonProcessingException e) {
            log.debug("反序列化失败，返回null: {}", e.getMessage());
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，返回null");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("获取缓存失败，返回null: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 删除会话信息缓存
     */
    public void deleteSessionInfoCache(String sessionId) {
        if (!redisAvailable) return;
        try {
            String key = CacheConstants.SESSION_CACHE_PREFIX + sessionId;
            redisTemplate.delete(key);
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，跳过删除");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("删除缓存失败，跳过: {}", e.getMessage());
        }
    }

    /**
     * 缓存分页会话消息
     */
    public void cachePagedSessionMessages(String sessionId, int page, int pageSize, Map<String, Object> messages) {
        if (!redisAvailable) return;
        try {
            String key = CacheConstants.MESSAGES_CACHE_PREFIX + sessionId + ":" + page + ":" + pageSize;
            String value = objectMapper.writeValueAsString(messages);
            redisTemplate.opsForValue().set(key, value, CACHE_DURATION);
        } catch (JsonProcessingException e) {
            log.debug("序列化失败，跳过缓存: {}", e.getMessage());
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，跳过缓存");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("缓存失败，跳过: {}", e.getMessage());
        }
    }

    /**
     * 获取缓存的分页会话消息
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getCachedPagedSessionMessages(String sessionId, int page, int pageSize) {
        if (!redisAvailable) return null;
        try {
            String key = CacheConstants.MESSAGES_CACHE_PREFIX + sessionId + ":" + page + ":" + pageSize;
            String value = redisTemplate.opsForValue().get(key);
            if (value != null) {
                Map<String, Object> cachedMap = objectMapper.readValue(value, Map.class);
                if (cachedMap != null && cachedMap.containsKey("messages")) {
                    Object messagesObj = cachedMap.get("messages");
                    if (messagesObj instanceof List) {
                        List<?> messagesList = (List<?>) messagesObj;
                        List<ChatRecord> chatRecords = messagesList.stream()
                            .filter(item -> item instanceof Map)
                            .map(item -> objectMapper.convertValue(item, ChatRecord.class))
                            .collect(Collectors.toList());
                        cachedMap.put("messages", chatRecords);
                    }
                }
                return cachedMap;
            }
        } catch (JsonProcessingException e) {
            log.debug("反序列化失败，返回null: {}", e.getMessage());
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，返回null");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("获取缓存失败，返回null: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 删除分页会话消息缓存
     */
    public void deletePagedSessionMessagesCache(String sessionId) {
        if (!redisAvailable) return;
        try {
            String pattern = CacheConstants.MESSAGES_CACHE_PREFIX + sessionId + ":*";
            redisTemplate.delete(redisTemplate.keys(pattern));
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis 不可用，跳过删除");
            redisAvailable = false;
        } catch (Exception e) {
            log.debug("删除缓存失败，跳过: {}", e.getMessage());
        }
    }
    
    /**
     * 重置 Redis 可用状态（用于健康检查恢复）
     */
    public void resetRedisAvailability() {
        this.redisAvailable = true;
    }
}
