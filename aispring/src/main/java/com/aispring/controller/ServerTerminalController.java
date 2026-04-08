package com.aispring.controller;

import com.aispring.dto.request.CommandExecutionRequest;
import com.aispring.dto.request.ServerConnectionRequest;
import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.ServerConnection;
import com.aispring.entity.ServerCommandExecution;
import com.aispring.entity.User;
import com.aispring.security.CurrentUser;
import com.aispring.service.ServerTerminalService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 服务器终端控制器
 */
@RestController
@RequestMapping("/api/server-terminal")
@RequiredArgsConstructor
public class ServerTerminalController {

    private final ServerTerminalService serverTerminalService;

    /**
     * 获取用户的服务器列表
     */
    @GetMapping("/servers")
    public ResponseEntity<ApiResponse<List<ServerConnection>>> getServers(@CurrentUser User user) {
        List<ServerConnection> servers = serverTerminalService.getServers(user.getId());
        return ResponseEntity.ok(ApiResponse.success("获取服务器列表成功", servers));
    }

    /**
     * 添加服务器
     */
    @PostMapping("/servers")
    public ResponseEntity<ApiResponse<ServerConnection>> addServer(
            @CurrentUser User user,
            @RequestParam(required = false) String serverName,
            @RequestParam String host,
            @RequestParam String username,
            @RequestParam String password,
            @RequestParam(required = false, defaultValue = "22") Integer port) {
        String normalizedServerName = serverName == null || serverName.trim().isEmpty()
                ? host
                : serverName.trim();

        ServerConnection server = serverTerminalService.addServer(
                user.getId(),
                normalizedServerName,
                host,
                username,
                password,
                port
        );
        return ResponseEntity.ok(ApiResponse.success("添加服务器成功", server));
    }

    /**
     * 删除服务器
     */
    @DeleteMapping("/servers/{serverId}")
    public ResponseEntity<ApiResponse<Void>> deleteServer(
            @CurrentUser User user,
            @PathVariable Long serverId) {
        serverTerminalService.deleteServer(user.getId(), serverId);
        return ResponseEntity.ok(ApiResponse.success("删除服务器成功", null));
    }

    /**
     * 连接服务器
     */
    @PostMapping("/servers/{serverId}/connect")
    public ResponseEntity<ApiResponse<String>> connectServer(
            @CurrentUser User user,
            @PathVariable Long serverId) {
        String message = serverTerminalService.connectServer(user.getId(), serverId);
        return ResponseEntity.ok(ApiResponse.success(message, message));
    }

    /**
     * 断开服务器连接
     */
    @PostMapping("/servers/{serverId}/disconnect")
    public ResponseEntity<ApiResponse<Void>> disconnectServer(
            @CurrentUser User user,
            @PathVariable Long serverId) {
        serverTerminalService.disconnectServer(user.getId(), serverId);
        return ResponseEntity.ok(ApiResponse.success("断开连接成功", null));
    }

    /**
     * 执行命令
     */
    @PostMapping("/servers/{serverId}/execute")
    public ResponseEntity<ApiResponse<ServerCommandExecution>> executeCommand(
            @CurrentUser User user,
            @PathVariable Long serverId,
            @RequestParam String command) {
        ServerCommandExecution execution = serverTerminalService.executeCommand(user.getId(), serverId, command);
        return ResponseEntity.ok(ApiResponse.success("执行命令成功", execution));
    }

    /**
     * 获取命令执行结果
     */
    @GetMapping("/executions/{executionId}")
    public ResponseEntity<ApiResponse<ServerCommandExecution>> getExecutionResult(
            @CurrentUser User user,
            @PathVariable Long executionId) {
        ServerCommandExecution execution = serverTerminalService.getExecutionResult(user.getId(), executionId);
        return ResponseEntity.ok(ApiResponse.success("获取执行结果成功", execution));
    }

    /**
     * 获取服务器的命令执行历史
     */
    @GetMapping("/servers/{serverId}/executions")
    public ResponseEntity<ApiResponse<List<ServerCommandExecution>>> getExecutionHistory(
            @CurrentUser User user,
            @PathVariable Long serverId) {
        List<ServerCommandExecution> executions = serverTerminalService.getExecutionHistory(user.getId(), serverId);
        return ResponseEntity.ok(ApiResponse.success("获取执行历史成功", executions));
    }
}
