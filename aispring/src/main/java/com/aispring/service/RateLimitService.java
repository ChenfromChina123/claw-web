package com.aispring.service;

import com.aispring.common.RateLimitConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@Slf4j
@RequiredArgsConstructor
public class RateLimitService {

    private final StringRedisTemplate redisTemplate;

    private static final Duration EXPIRATION = Duration.ofHours(RateLimitConstants.CHAT_EXPIRATION_HOURS);

    /**
     * Check if the IP is allowed to make a request.
     * If allowed, increments the counter.
     * @param ip Client IP address
     * @return true if allowed, false if limit exceeded
     */
    public boolean checkAndIncrement(String ip) {
        String key = RateLimitConstants.CHAT_LIMIT_PREFIX + ip;

        try {
            Long count = redisTemplate.opsForValue().increment(key);

            // If it's the first request (count == 1), set expiration
            if (count != null && count == 1) {
                redisTemplate.expire(key, EXPIRATION);
            }

            if (count != null && count > RateLimitConstants.CHAT_MAX_REQUESTS) {
                log.warn("Rate limit exceeded for IP: {} (Count: {})", ip, count);
                return false;
            }

            return true;
        } catch (Exception e) {
            log.error("Error accessing Redis for rate limiting", e);
            // If Redis fails, allow the request to avoid blocking users due to system error
            // Or deny it? Safe failure usually means allow.
            return true;
        }
    }

    /**
     * Get remaining requests for an IP
     * @param ip Client IP address
     * @return remaining requests count
     */
    public int getRemainingRequests(String ip) {
        String key = RateLimitConstants.CHAT_LIMIT_PREFIX + ip;
        String val = redisTemplate.opsForValue().get(key);
        if (val == null) {
            return RateLimitConstants.CHAT_MAX_REQUESTS;
        }
        try {
            int used = Integer.parseInt(val);
            return Math.max(0, RateLimitConstants.CHAT_MAX_REQUESTS - used);
        } catch (NumberFormatException e) {
            return RateLimitConstants.CHAT_MAX_REQUESTS;
        }
    }

    /**
     * 通用限流检查（支持自定义 key 前缀、上限和窗口）
     * @param keyPrefix key 前缀
     * @param identifier 标识符（如 userId）
     * @param maxRequests 最大请求数
     * @param window 限流窗口时长
     * @return true 表示允许，false 表示超限
     */
    public boolean checkAndIncrement(String keyPrefix, String identifier, int maxRequests, Duration window) {
        String key = keyPrefix + identifier;
        try {
            Long count = redisTemplate.opsForValue().increment(key);
            if (count != null && count == 1) {
                redisTemplate.expire(key, window);
            }
            if (count != null && count > maxRequests) {
                log.warn("Rate limit exceeded for {}{} (Count: {})", keyPrefix, identifier, count);
                return false;
            }
            return true;
        } catch (Exception e) {
            log.error("Error accessing Redis for rate limiting ({}{})", keyPrefix, identifier, e);
            return true;
        }
    }

    /**
     * 获取通用限流的剩余请求数
     * @param keyPrefix key 前缀
     * @param identifier 标识符
     * @param maxRequests 最大请求数
     * @return 剩余请求数
     */
    public int getRemainingRequests(String keyPrefix, String identifier, int maxRequests) {
        String key = keyPrefix + identifier;
        String val = redisTemplate.opsForValue().get(key);
        if (val == null) {
            return maxRequests;
        }
        try {
            int used = Integer.parseInt(val);
            return Math.max(0, maxRequests - used);
        } catch (NumberFormatException e) {
            return maxRequests;
        }
    }
}
