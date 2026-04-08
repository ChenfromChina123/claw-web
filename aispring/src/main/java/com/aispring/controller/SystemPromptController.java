package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.SystemPrompt;
import com.aispring.service.SystemPromptService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 系统提示词管理控制器 (仅限管理员)
 */
@RestController
@RequestMapping("/api/admin/prompts")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class SystemPromptController {

    private final SystemPromptService promptService;

    /**
     * 获取所有提示词
     */
    @GetMapping
    public ApiResponse<List<SystemPrompt>> listPrompts() {
        return ApiResponse.success(promptService.getAllPrompts());
    }

    /**
     * 保存或更新提示词
     */
    @PostMapping
    public ApiResponse<SystemPrompt> savePrompt(@RequestBody SystemPrompt prompt) {
        return ApiResponse.success("保存提示词成功", promptService.savePrompt(prompt));
    }

    /**
     * 删除提示词
     */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deletePrompt(@PathVariable Long id) {
        promptService.deletePrompt(id);
        return ApiResponse.success("删除提示词成功", null);
    }

    /**
     * 立即从远程同步提示词
     */
    @PostMapping("/sync")
    public ApiResponse<Void> syncPrompts() {
        promptService.syncFromRemote();
        return ApiResponse.success("已触发远程同步", null);
    }
}
