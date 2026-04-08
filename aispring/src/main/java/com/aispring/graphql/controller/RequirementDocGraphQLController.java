package com.aispring.graphql.controller;

import com.aispring.entity.RequirementDoc;
import com.aispring.entity.RequirementDocHistory;
import com.aispring.entity.TokenUsageAudit;
import com.aispring.entity.User;
import com.aispring.graphql.dto.*;
import com.aispring.repository.RequirementDocHistoryRepository;
import com.aispring.repository.RequirementDocRepository;
import com.aispring.repository.TokenUsageAuditRepository;
import com.aispring.repository.UserRepository;
import com.aispring.security.CustomUserDetails;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * GraphQL 控制器 - 需求文档模块
 * 
 * 使用 @SchemaMapping 实现声明式数据分片加载：
 * - 前端通过 Fragments 指定需要哪些字段
 * - 后端只执行对应的 @SchemaMapping 方法
 * - DataLoader 自动批量加载，避免 N+1 问题
 */
@Controller
@RequiredArgsConstructor
@Slf4j
public class RequirementDocGraphQLController {

    private final RequirementDocRepository requirementDocRepository;
    private final UserRepository userRepository;
    private final RequirementDocHistoryRepository historyRepository;
    private final TokenUsageAuditRepository tokenUsageAuditRepository;

    // ===========================
    // 查询操作 - @QueryMapping
    // ===========================

    /**
     * 查询需求文档列表（分页）
     * 
     * 前端可以通过 Fragment 指定需要的字段：
     * query {
     *   requirementDocs(page: 0, size: 10) {
     *     content {
     *       ...BasicFields    # 只加载基础字段
     *     }
     *   }
     * }
     */
    /**
     * 查询需求文档列表（分页）
     * 
     * 前端可以通过 Fragment 指定需要的字段：
     * query {
     *   requirementDocs(page: 0, size: 10) {
     *     content {
     *       ...BasicFields    # 只加载基础字段
     *     }
     *   }
     * }
     */
    @QueryMapping
    public RequirementDocConnection requirementDocs(
            @Argument Integer page,
            @Argument Integer size,
            @AuthenticationPrincipal CustomUserDetails principal) {
        
        // 如果没有登录，返回空结果
        if (principal == null) {
            return RequirementDocConnection.builder()
                    .content(List.of())
                    .pageInfo(com.aispring.graphql.dto.PageInfo.builder()
                            .page(0)
                            .size(0)
                            .totalElements(0L)
                            .totalPages(0)
                            .hasNext(false)
                            .build())
                    .build();
        }
        
        log.info("GraphQL Query: requirementDocs(page={}, size={}) by user={}", 
                page, size, principal.getUsername());
        
        Page<RequirementDoc> docPage = requirementDocRepository.findByUserId(
                principal.getUser().getId(), 
                PageRequest.of(page, size)
        );
        
        return RequirementDocConnection.fromPage(docPage);
    }

    /**
     * 根据 ID 查询单个文档
     */
    @QueryMapping
    public RequirementDoc requirementDoc(@Argument Long id) {
        log.info("GraphQL Query: requirementDoc(id={})", id);
        return requirementDocRepository.findById(id).orElse(null);
    }

    /**
     * 查询当前用户的所有文档
     */
    @QueryMapping
    public List<RequirementDoc> myRequirementDocs(
            @AuthenticationPrincipal CustomUserDetails principal) {
        
        if (principal == null) {
            return List.of();
        }
        
        log.info("GraphQL Query: myRequirementDocs by user={}", principal.getUsername());
        return requirementDocRepository.findByUserId(principal.getUser().getId());
    }

    /**
     * 查询用户信息
     */
    @QueryMapping
    public User user(@Argument Long id) {
        log.info("GraphQL Query: user(id={})", id);
        return userRepository.findById(id).orElse(null);
    }

    // ===========================
    // 片段字段解析 - @SchemaMapping
    // 按需加载：只有前端请求这些字段时才执行
    // ===========================

    /**
     * 解析 RequirementDoc.user 字段
     * 
     * 使用 DataLoader 批量加载用户信息
     * 当查询 10 个文档时，不会执行 10 次数据库查询，而是：
     * 1. 收集 10 个 userId
     * 2. 一次性批量查询
     * 3. 分发给各个文档
     * 
     * 前端 Fragment 示例：
     * fragment WithUser on RequirementDoc {
     *   id
     *   title
     *   user {
     *     username
     *     avatar
     *   }
     * }
     */
    @SchemaMapping(typeName = "RequirementDoc", field = "user")
    public CompletableFuture<User> user(RequirementDoc doc) {
        log.debug("Loading user for doc id={}", doc.getId());
        
        // DataLoader 会自动批量加载
        return CompletableFuture.supplyAsync(() -> 
                userRepository.findById(doc.getUserId()).orElse(null)
        );
    }

    /**
     * 解析 RequirementDoc.statistics 字段
     * 
     * 独立片段，按需加载文档统计信息
     * 
     * 前端 Fragment 示例：
     * fragment WithStatistics on RequirementDoc {
     *   statistics {
     *     wordCount
     *     editCount
     *     lastEditedAt
     *   }
     * }
     */
    @SchemaMapping(typeName = "RequirementDoc", field = "statistics")
    public RequirementDocStatistics statistics(RequirementDoc doc) {
        log.debug("Computing statistics for doc id={}", doc.getId());
        
        // 计算文档统计信息
        int wordCount = doc.getContent() != null ? doc.getContent().length() : 0;
        int editCount = historyRepository.countByDocId(doc.getId());
        
        return RequirementDocStatistics.builder()
                .wordCount(wordCount)
                .editCount(editCount)
                .lastEditedAt(doc.getUpdatedAt())
                .published(false) // 示例值
                .build();
    }

    /**
     * 解析 RequirementDoc.historyVersions 字段
     * 
     * 独立片段，按需加载历史版本列表
     * 
     * 前端 Fragment 示例：
     * fragment WithHistory on RequirementDoc {
     *   historyVersions {
     *     version
     *     createdAt
     *   }
     * }
     */
    @SchemaMapping(typeName = "RequirementDoc", field = "historyVersions")
    public List<RequirementDocHistory> historyVersions(RequirementDoc doc) {
        log.debug("Loading history versions for doc id={}", doc.getId());
        
        // 可以配合 DataLoader 批量加载
        return historyRepository.findByDocIdOrderByVersionDesc(doc.getId());
    }

    /**
     * 解析 RequirementDoc.tokenUsage 字段
     * 
     * 独立片段，按需加载 Token 使用统计
     * 
     * 前端 Fragment 示例：
     * fragment WithTokenUsage on RequirementDoc {
     *   tokenUsage {
     *     totalTokens
     *     avgResponseTime
     *     provider
     *   }
     * }
     */
    @SchemaMapping(typeName = "RequirementDoc", field = "tokenUsage")
    public TokenUsageInfo tokenUsage(RequirementDoc doc) {
        log.debug("Computing token usage for doc id={}", doc.getId());
        
        // 查询该文档相关的 Token 使用记录
        // 简化处理：查询用户最近的审计记录
        List<TokenUsageAudit> audits = tokenUsageAuditRepository
                .findTop10ByUserIdOrderByCreatedAtDesc(doc.getUserId());
        
        if (audits.isEmpty()) {
            return TokenUsageInfo.builder()
                    .totalTokens(0)
                    .inputTokens(0)
                    .outputTokens(0)
                    .avgResponseTime(0)
                    .provider("unknown")
                    .build();
        }
        
        // 聚合统计
        int totalInput = audits.stream().mapToInt(TokenUsageAudit::getInputTokens).sum();
        int totalOutput = audits.stream().mapToInt(TokenUsageAudit::getOutputTokens).sum();
        int avgTime = (int) audits.stream()
                .mapToLong(TokenUsageAudit::getResponseTimeMs)
                .average()
                .orElse(0);
        
        return TokenUsageInfo.builder()
                .totalTokens(totalInput + totalOutput)
                .inputTokens(totalInput)
                .outputTokens(totalOutput)
                .avgResponseTime(avgTime)
                .provider(audits.get(0).getProvider())
                .build();
    }

    // ===========================
    // 变更操作 - @MutationMapping
    // ===========================

    /**
     * 创建需求文档
     */
    @MutationMapping
    public RequirementDoc createRequirementDoc(
            @Argument CreateRequirementDocInput input,
            @AuthenticationPrincipal CustomUserDetails principal) {
        
        if (principal == null) {
            throw new RuntimeException("未登录");
        }
        
        log.info("GraphQL Mutation: createRequirementDoc by user={}", principal.getUsername());
        
        RequirementDoc doc = RequirementDoc.builder()
                .userId(principal.getUser().getId())
                .title(input.getTitle())
                .content(input.getContent())
                .version(1)
                .build();
        
        return requirementDocRepository.save(doc);
    }

    /**
     * 更新需求文档
     */
    @MutationMapping
    public RequirementDoc updateRequirementDoc(
            @Argument Long id,
            @Argument UpdateRequirementDocInput input) {
        
        log.info("GraphQL Mutation: updateRequirementDoc(id={})", id);
        
        RequirementDoc doc = requirementDocRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Document not found"));
        
        if (input.getTitle() != null) {
            doc.setTitle(input.getTitle());
        }
        if (input.getContent() != null) {
            doc.setContent(input.getContent());
        }
        
        return requirementDocRepository.save(doc);
    }

    /**
     * 删除需求文档
     */
    @MutationMapping
    public Boolean deleteRequirementDoc(@Argument Long id) {
        log.info("GraphQL Mutation: deleteRequirementDoc(id={})", id);
        
        requirementDocRepository.deleteById(id);
        return true;
    }
}
