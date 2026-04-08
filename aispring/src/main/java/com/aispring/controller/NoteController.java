package com.aispring.controller;

import com.aispring.entity.Note;
import com.aispring.service.NoteService;
import com.aispring.dto.response.MessageResponse;
import com.aispring.security.CustomUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 笔记控制器
 * 对应Python: app.py中的/api/notes端点
 */
@RestController
@RequestMapping("/api/notes")
@RequiredArgsConstructor
public class NoteController {
    
    private final NoteService noteService;
    
    @Data
    public static class SaveNoteRequest {
        @NotBlank(message = "标题不能为空")
        private String title;
        
        @NotBlank(message = "内容不能为空")
        private String content;
        
        private String filePath;
    }
    
    /**
     * 保存笔记
     * Python: POST /api/notes/save
     */
    @PostMapping("/save")
    public ResponseEntity<Note> saveNote(
            @Valid @RequestBody SaveNoteRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        String filePath = (request.getFilePath() != null && !request.getFilePath().isEmpty())
                ? request.getFilePath()
                : ("/笔记/" + System.currentTimeMillis() + ".md");
        Note note = noteService.saveNote(
            userId, request.getTitle(), request.getContent(), filePath);
        
        return ResponseEntity.ok(note);
    }
    
    /**
     * 获取笔记列表
     * Python: GET /api/notes/list
     */
    @GetMapping("/list")
    public ResponseEntity<Map<String, Object>> getNotesList(
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        List<Note> notes = noteService.getUserNotes(userId);
        
        Map<String, Object> response = new HashMap<>();
        response.put("notes", notes);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * 获取笔记详情
     * Python: GET /api/notes/{note_id}
     */
    @GetMapping("/{noteId}")
    public ResponseEntity<Note> getNoteById(
            @PathVariable Long noteId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        Note note = noteService.getNoteById(userId, noteId);
        
        return ResponseEntity.ok(note);
    }
    
    /**
     * 删除笔记
     * Python: DELETE /api/notes/{note_id}
     */
    @DeleteMapping("/{noteId}")
    public ResponseEntity<MessageResponse> deleteNote(
            @PathVariable Long noteId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        Long userId = customUserDetails.getUser().getId();
        noteService.deleteNote(userId, noteId);
        
        return ResponseEntity.ok(
            MessageResponse.builder()
                .message("笔记已删除")
                .build()
        );
    }
}

