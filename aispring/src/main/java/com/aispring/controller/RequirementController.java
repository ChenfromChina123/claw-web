package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.RequirementDoc;
import com.aispring.entity.RequirementDocHistory;
import com.aispring.repository.RequirementDocHistoryRepository;
import com.aispring.repository.RequirementDocRepository;
import com.aispring.security.CustomUserDetails;
import com.aispring.service.AgentService;
import com.aispring.service.AiChatService;
import com.aispring.service.SearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/requirements")
@RequiredArgsConstructor
public class RequirementController {

    private final RequirementDocRepository docRepository;
    private final RequirementDocHistoryRepository historyRepository;
    private final AiChatService aiChatService;
    private final AgentService agentService;
    private final SearchService searchService;

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<RequirementDoc>> listDocs(@AuthenticationPrincipal CustomUserDetails currentUser) {
        List<RequirementDoc> docs = docRepository.findByUserIdOrderByUpdatedAtDesc(currentUser.getUser().getId());
        return ApiResponse.success(docs);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<RequirementDoc> createDoc(@AuthenticationPrincipal CustomUserDetails currentUser, @RequestBody RequirementDoc doc) {
        doc.setUserId(currentUser.getUser().getId());
        doc.setVersion(1);
        RequirementDoc saved = docRepository.save(doc);
        
        // Save initial history
        historyRepository.save(RequirementDocHistory.builder()
                .docId(saved.getId())
                .content(saved.getContent())
                .version(1)
                .build());
        
        return ApiResponse.success(saved);
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<RequirementDoc> updateDoc(@AuthenticationPrincipal CustomUserDetails currentUser, @PathVariable Long id, @RequestBody RequirementDoc update) {
        RequirementDoc doc = docRepository.findById(id).orElseThrow(() -> new RuntimeException("Doc not found"));
        if (!doc.getUserId().equals(currentUser.getUser().getId())) {
            throw new RuntimeException("Unauthorized");
        }

        doc.setContent(update.getContent());
        doc.setTitle(update.getTitle());
        doc.setVersion(doc.getVersion() + 1);
        RequirementDoc saved = docRepository.save(doc);

        historyRepository.save(RequirementDocHistory.builder()
                .docId(saved.getId())
                .content(saved.getContent())
                .version(saved.getVersion())
                .build());

        return ApiResponse.success(saved);
    }

    @GetMapping("/{id}/history")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<RequirementDocHistory>> getHistory(@AuthenticationPrincipal CustomUserDetails currentUser, @PathVariable Long id) {
        RequirementDoc doc = docRepository.findById(id).orElseThrow(() -> new RuntimeException("Doc not found"));
        if (!doc.getUserId().equals(currentUser.getUser().getId())) {
            throw new RuntimeException("Unauthorized");
        }
        List<RequirementDocHistory> history = historyRepository.findByDocIdOrderByVersionDesc(id);
        return ApiResponse.success(history);
    }

    @PostMapping(value = "/generate-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public SseEmitter generateDocStream(@AuthenticationPrincipal CustomUserDetails currentUser, @RequestBody Map<String, String> request) {
        String prompt = request.get("prompt");
        String fullPrompt = "You are a professional Product Manager.\n请根据以下需求，生成一份详细的需求文档（Markdown格式）：\n" + prompt;
        // Use a generic model or specific one. Assuming 'deepseek-chat' as default.
        return aiChatService.askStream(fullPrompt, null, "deepseek-chat", currentUser.getUser().getId());
    }

    /**
     * Agent领域识别与问题生成
     */
    @PostMapping("/agent/questions")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<String> generateQuestions(
            @AuthenticationPrincipal CustomUserDetails currentUser,
            @RequestBody Map<String, String> request) {
        String userIdea = request.get("userIdea");
        String questionsJson = agentService.generateQuestions(userIdea, currentUser.getUser().getId());
        return ApiResponse.success(questionsJson);
    }

    /**
     * Agent流式文档生成
     */
    @PostMapping(value = "/agent/generate-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public SseEmitter generateAgentDocStream(
            @AuthenticationPrincipal CustomUserDetails currentUser,
            @RequestBody Map<String, String> request) {
        String userIdea = request.get("userIdea");
        String answers = request.get("answers");
        String domain = request.get("domain");

        // 1. 获取实时搜索结果
        String searchResult = searchService.searchIndustryInfo(domain + " " + userIdea);

        // 2. 调用Agent生成文档
        return agentService.generateDocumentStream(userIdea, answers, searchResult, currentUser.getUser().getId());
    }
}
