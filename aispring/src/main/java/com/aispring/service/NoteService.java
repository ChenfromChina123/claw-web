package com.aispring.service;

import com.aispring.entity.Note;
import com.aispring.repository.NoteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 笔记服务
 */
@Service
@RequiredArgsConstructor
public class NoteService {
    
    private final NoteRepository noteRepository;
    
    /**
     * 创建或更新笔记
     */
    @Transactional
    public Note saveNote(Long userId, String title, String content, String filePath) {
        // 如果已存在同路径的笔记，更新它
        return noteRepository.findByFilePath(filePath)
            .map(existingNote -> {
                existingNote.setTitle(title);
                existingNote.setContent(content);
                return noteRepository.save(existingNote);
            })
            .orElseGet(() -> {
                Note note = Note.builder()
                    .userId(userId)
                    .title(title)
                    .content(content)
                    .filePath(filePath)
                    .build();
                return noteRepository.save(note);
            });
    }
    
    /**
     * 获取用户的所有笔记
     */
    public List<Note> getUserNotes(Long userId) {
        return noteRepository.findByUserIdOrderByUpdatedAtDesc(userId);
    }
    
    /**
     * 根据ID获取笔记
     */
    public Note getNoteById(Long userId, Long noteId) {
        return noteRepository.findByIdAndUserId(noteId, userId)
            .orElseThrow(() -> new IllegalArgumentException("笔记不存在"));
    }
    
    /**
     * 删除笔记
     */
    @Transactional
    public void deleteNote(Long userId, Long noteId) {
        Note note = getNoteById(userId, noteId);
        noteRepository.delete(note);
    }
}

