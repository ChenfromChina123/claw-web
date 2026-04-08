package com.aispring.repository;

import com.aispring.entity.UrlFilterRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * URL过滤规则Repository
 */
@Repository
public interface UrlFilterRuleRepository extends JpaRepository<UrlFilterRule, Long> {

    /**
     * 查询所有启用的规则，按优先级排序
     * @return 启用的规则列表
     */
    @Query("SELECT r FROM UrlFilterRule r WHERE r.enabled = true ORDER BY r.priority ASC")
    List<UrlFilterRule> findAllEnabledOrderByPriority();

    /**
     * 根据过滤类型查询启用的规则
     * @param filterType 过滤类型
     * @return 规则列表
     */
    @Query("SELECT r FROM UrlFilterRule r WHERE r.enabled = true AND r.filterType = ?1 ORDER BY r.priority ASC")
    List<UrlFilterRule> findByFilterTypeEnabled(UrlFilterRule.FilterType filterType);

    /**
     * 根据匹配类型查询启用的规则
     * @param matchType 匹配类型
     * @return 规则列表
     */
    @Query("SELECT r FROM UrlFilterRule r WHERE r.enabled = true AND r.matchType = ?1 ORDER BY r.priority ASC")
    List<UrlFilterRule> findByMatchTypeEnabled(UrlFilterRule.MatchType matchType);

    /**
     * 根据分类查询启用的规则
     * @param category 分类名称
     * @return 规则列表
     */
    @Query("SELECT r FROM UrlFilterRule r WHERE r.enabled = true AND r.category = ?1 ORDER BY r.priority ASC")
    List<UrlFilterRule> findByCategoryEnabled(String category);

    /**
     * 根据名称模糊查询
     * @param name 规则名称
     * @return 规则列表
     */
    List<UrlFilterRule> findByNameContainingIgnoreCase(String name);
}
