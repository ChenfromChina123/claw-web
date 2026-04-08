package com.aispring.service;

import com.aispring.entity.ExternalLink;

import java.util.List;

/**
 * 外部链接服务接口
 */
public interface ExternalLinkService {
    
    /**
     * 获取所有激活的链接（按点击次数排序）
     */
    List<ExternalLink> getAllActiveLinks();
    
    /**
     * 获取所有链接（管理后台用）
     */
    List<ExternalLink> getAllLinks();
    
    /**
     * 根据ID获取链接
     */
    ExternalLink getLinkById(Long id);
    
    /**
     * 创建链接
     */
    ExternalLink createLink(ExternalLink link);
    
    /**
     * 更新链接
     */
    ExternalLink updateLink(Long id, ExternalLink link);
    
    /**
     * 删除链接
     */
    void deleteLink(Long id);
    
    /**
     * 记录点击（带防爬虫验证）并返回最新点击次数
     */
    int recordClick(Long id, String userAgent, String clientIp);
}
