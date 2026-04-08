package com.aispring.controller;

import com.aispring.security.CustomUserDetails;
import com.aispring.service.WordGameService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.http.HttpStatus;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/word-game")
@RequiredArgsConstructor
public class WordGameController {
    private final WordGameService wordGameService;

    @GetMapping("/packages")
    public ResponseEntity<Map<String, Object>> getPackages(
            @RequestParam(required = false) String search,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        List<Map<String, Object>> list = wordGameService.getPackages(customUserDetails.getUser().getId(), search);
        return ResponseEntity.ok(success(list));
    }

    @PostMapping("/packages/{packageId}/click")
    public ResponseEntity<Map<String, Object>> recordClick(@PathVariable String packageId) {
        wordGameService.recordPackageClick(packageId);
        return ResponseEntity.ok(success(null));
    }

    @GetMapping("/packages/{packageId}/courses")
    public ResponseEntity<Map<String, Object>> getCourses(
            @PathVariable String packageId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        List<Map<String, Object>> list = wordGameService.getPackageCourses(customUserDetails.getUser().getId(), packageId);
        return ResponseEntity.ok(success(list));
    }

    @GetMapping("/courses/{courseIndex}/questions")
    public ResponseEntity<Map<String, Object>> getQuestions(
            @PathVariable Integer courseIndex,
            @RequestParam(required = false) String packageId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        List<Map<String, Object>> list = wordGameService.getCourseQuestions(customUserDetails.getUser().getId(), courseIndex, packageId);
        return ResponseEntity.ok(success(list));
    }

    @PostMapping("/packages")
    public ResponseEntity<Map<String, Object>> createPackage(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        Map<String, Object> data = wordGameService.createPackage(customUserDetails.getUser().getId(), body);
        return ResponseEntity.ok(success(data));
    }

    @PostMapping("/packages/{packageId}/sections")
    public ResponseEntity<Map<String, Object>> addSection(
            @PathVariable String packageId,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        Map<String, Object> data = wordGameService.addPackageSection(customUserDetails.getUser().getId(), packageId, body);
        return ResponseEntity.ok(success(data));
    }

    @GetMapping("/progress")
    public ResponseEntity<Map<String, Object>> getProgress(
            @RequestParam String packageId,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        Map<String, Object> data = wordGameService.getProgress(customUserDetails.getUser().getId(), packageId);
        return ResponseEntity.ok(success(data));
    }

    @PostMapping("/progress")
    public ResponseEntity<Map<String, Object>> saveProgress(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        wordGameService.saveProgress(customUserDetails.getUser().getId(), body);
        return ResponseEntity.ok(success(null));
    }

    @PostMapping("/progress/migrate")
    public ResponseEntity<Map<String, Object>> migrateProgress(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal CustomUserDetails customUserDetails
    ) {
        Map<String, Object> result = wordGameService.migrateProgress(customUserDetails.getUser().getId(), body);
        return ResponseEntity.ok(result);
    }

    private Map<String, Object> success(Object data) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("data", data);
        return result;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", false);
        result.put("message", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(result);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleException(Exception ex) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", false);
        result.put("message", ex.getMessage());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(result);
    }
}
