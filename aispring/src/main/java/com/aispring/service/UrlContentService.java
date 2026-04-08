package com.aispring.service;

/**
 * URL内容获取服务接口
 * 用于获取指定URL的网页内容
 */
public interface UrlContentService {

    /**
     * 获取URL的网页内容
     * @param url 目标URL
     * @return 网页内容摘要
     */
    String fetchUrlContent(String url);

    /**
     * 获取URL的网页内容（带字数限制）
     * @param url 目标URL
     * @param maxChars 最大字符数
     * @return 网页内容摘要
     */
    String fetchUrlContent(String url, int maxChars);

    /**
     * 检查URL是否可访问
     * @param url 目标URL
     * @return 是否可访问
     */
    boolean isUrlAccessible(String url);
}
