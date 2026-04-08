package com.aispring.service.impl;

import com.aispring.entity.ExternalLink;
import com.aispring.repository.ExternalLinkRepository;
import com.aispring.service.ExternalLinkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * 外部链接服务实现类
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExternalLinkServiceImpl implements ExternalLinkService {
    
    private final ExternalLinkRepository externalLinkRepository;
    
    // 简单的防爬虫机制：记录IP+链接ID的最后点击时间
    private final ConcurrentHashMap<String, Long> clickCache = new ConcurrentHashMap<>();
    
    // 点击间隔限制（毫秒）
    private static final long CLICK_INTERVAL = TimeUnit.SECONDS.toMillis(3);
    
    /**
     * 获取所有激活的链接（按点击次数排序）
     */
    @Override
    public List<ExternalLink> getAllActiveLinks() {
        return externalLinkRepository.findByIsActiveTrueOrderByClickCountDescSortOrderAsc();
    }
    
    /**
     * 获取所有链接（管理后台用）
     */
    @Override
    public List<ExternalLink> getAllLinks() {
        return externalLinkRepository.findAll();
    }
    
    /**
     * 根据ID获取链接
     */
    @Override
    public ExternalLink getLinkById(Long id) {
        return externalLinkRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("链接不存在"));
    }
    
    /**
     * 创建链接
     */
    @Override
    @Transactional
    public ExternalLink createLink(ExternalLink link) {
        return externalLinkRepository.save(link);
    }
    
    /**
     * 更新链接
     */
    @Override
    @Transactional
    public ExternalLink updateLink(Long id, ExternalLink link) {
        ExternalLink existingLink = getLinkById(id);
        
        existingLink.setTitle(link.getTitle());
        existingLink.setUrl(link.getUrl());
        existingLink.setDescription(link.getDescription());
        existingLink.setImageUrl(link.getImageUrl());
        existingLink.setIsActive(link.getIsActive());
        existingLink.setSortOrder(link.getSortOrder());
        
        return externalLinkRepository.save(existingLink);
    }
    
    /**
     * 删除链接
     */
    @Override
    @Transactional
    public void deleteLink(Long id) {
        externalLinkRepository.deleteById(id);
    }
    
    /**
     * 记录点击（带防爬虫验证）并返回最新点击次数
     * 即使被拦截也返回当前计数，避免影响用户体验
     */
    @Override
    @Transactional
    public int recordClick(Long id, String userAgent, String clientIp) {
        try {
            // 检查链接是否存在
            ExternalLink link = getLinkById(id);
            
            // 防爬虫检查
            if (!isValidClick(id, clientIp, userAgent)) {
                log.warn("疑似爬虫点击被拦截 - IP: {}, LinkId: {}, UserAgent: {}", clientIp, id, userAgent);
                // 即使被拦截也返回当前计数
                return link.getClickCount() != null ? link.getClickCount() : 0;
            }
            
            // 记录点击
            String cacheKey = clientIp + "_" + id;
            clickCache.put(cacheKey, System.currentTimeMillis());
            
            // 增加点击次数（数据库原子操作，自动持久化）
            externalLinkRepository.incrementClickCount(id);
            
            // 重新查询获取最新的点击次数（确保数据一致性）
            ExternalLink updatedLink = externalLinkRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("链接不存在"));
            
            int newClickCount = updatedLink.getClickCount() != null ? updatedLink.getClickCount() : 0;
            
            log.info("✅ 点击次数已持久化到数据库 - LinkId: {}, Title: {}, IP: {}, 新点击次数: {}", 
                    id, link.getTitle(), clientIp, newClickCount);
            
            return newClickCount;
            
        } catch (Exception e) {
            // 记录异常但不抛出，避免影响用户体验
            log.error("❌ 记录点击失败 - LinkId: {}, IP: {}", id, clientIp, e);
            // 返回0表示更新失败
            return 0;
        }
    }
    
    /**
     * 验证是否为有效点击（简单的防爬虫机制）
     */
    private boolean isValidClick(Long linkId, String clientIp, String userAgent) {
        // 1. 检查User-Agent是否存在
        if (userAgent == null || userAgent.trim().isEmpty()) {
            return false;
        }
        
        // 2. 拒绝常见爬虫User-Agent
        String lowerUserAgent = userAgent.toLowerCase();
        if (lowerUserAgent.contains("bot") || 
            lowerUserAgent.contains("crawler") || 
            lowerUserAgent.contains("spider") ||
            lowerUserAgent.contains("scraper")) {
            return false;
        }
        
        // 3. 检查同一IP对同一链接的点击间隔
        String cacheKey = clientIp + "_" + linkId;
        Long lastClickTime = clickCache.get(cacheKey);
        
        if (lastClickTime != null) {
            long timeSinceLastClick = System.currentTimeMillis() - lastClickTime;
            if (timeSinceLastClick < CLICK_INTERVAL) {
                return false; // 点击过于频繁
            }
        }
        
        // 4. 清理过期的缓存（超过1小时）
        cleanExpiredCache();
        
        return true;
    }
    
    /**
     * 清理过期的点击缓存
     */
    private void cleanExpiredCache() {
        long now = System.currentTimeMillis();
        long expirationTime = TimeUnit.HOURS.toMillis(1);
        
        clickCache.entrySet().removeIf(entry -> 
            (now - entry.getValue()) > expirationTime
        );
    }
}
