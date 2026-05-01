package com.example.claw_code_application.viewmodel

import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.websocket.WebSocketManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

/**
 * ChatViewModel的WebSocket事件处理扩展
 * 将handleWebSocketEvent从ViewModel主体中分离，降低单文件行数
 */

internal fun ChatViewModel.handleWebSocketEvent(event: WebSocketManager.WebSocketEvent) {
    when (event) {
        is WebSocketManager.WebSocketEvent.MessageStart -> handleMessageStart(event)
        is WebSocketManager.WebSocketEvent.MessageDelta -> handleMessageDelta(event)
        is WebSocketManager.WebSocketEvent.MessageStop -> handleMessageStop(event)
        is WebSocketManager.WebSocketEvent.MessageSaved -> handleMessageSaved(event)
        is WebSocketManager.WebSocketEvent.ContentBlockStart -> handleContentBlockStart(event)
        is WebSocketManager.WebSocketEvent.ContentBlockDelta -> handleContentBlockDelta(event)
        is WebSocketManager.WebSocketEvent.ContentBlockStop -> {}
        is WebSocketManager.WebSocketEvent.ToolUse -> handleToolUse(event)
        is WebSocketManager.WebSocketEvent.ToolInputDelta -> handleToolInputDelta(event)
        is WebSocketManager.WebSocketEvent.ToolStart -> handleToolStart(event)
        is WebSocketManager.WebSocketEvent.ToolEnd -> handleToolEnd(event)
        is WebSocketManager.WebSocketEvent.ToolError -> handleToolError(event)
        is WebSocketManager.WebSocketEvent.ToolProgress -> handleToolProgress(event)
        is WebSocketManager.WebSocketEvent.ToolUseEnd -> handleToolUseEnd(event)
        is WebSocketManager.WebSocketEvent.ConversationEnd -> handleConversationEnd()
        is WebSocketManager.WebSocketEvent.Error -> handleErrorEvent(event)
        is WebSocketManager.WebSocketEvent.AgentPush -> handleAgentPush(event)
        is WebSocketManager.WebSocketEvent.TaskStatusChanged -> handleTaskStatusChanged(event)
    }
}

private fun ChatViewModel.handleMessageStart(event: WebSocketManager.WebSocketEvent.MessageStart) {
    streamingMessageId = event.messageId
    currentThinkingBlockIndex = -1
    _thinkingContent = ""

    if (unassociatedToolCallIds.isNotEmpty()) {
        val toolCallList = messageToToolCalls.getOrPut(event.messageId) { mutableListOf() }
        toolCallList.addAll(unassociatedToolCallIds)
        unassociatedToolCallIds.clear()
    }

    _messages.add(Message(
        id = event.messageId, role = "assistant", content = "",
        timestamp = System.currentTimeMillis().toString(), isStreaming = true
    ))
    updateDisplayMessages()
    _uiState.value = ChatViewModel.UiState.Success(
        messages = _messages.toList(), toolCalls = _toolCalls.toList(),
        executionStatus = ExecutionStatus(status = "running", currentTurn = event.iteration, maxTurns = 20, progress = 0)
    )
}

private fun ChatViewModel.handleMessageDelta(event: WebSocketManager.WebSocketEvent.MessageDelta) {
    pendingDeltaText.append(event.delta)
    debounceJob?.cancel()
    debounceJob = vmScope.launch {
        delay(debounceIntervalMs)
        val deltaToApply = pendingDeltaText.toString()
        pendingDeltaText.clear()
        streamingMessageId?.let { messageId ->
            val index = _messages.indexOfFirst { it.id == messageId }
            if (index != -1) {
                val oldMessage = _messages[index]
                _messages[index] = oldMessage.copy(content = oldMessage.content + deltaToApply)
                updateDisplayMessages()
            }
        }
    }
}

private fun ChatViewModel.handleMessageStop(event: WebSocketManager.WebSocketEvent.MessageStop) {
    debounceJob?.cancel()
    val remainingDelta = pendingDeltaText.toString()
    pendingDeltaText.clear()
    streamingMessageId?.let { messageId ->
        val index = _messages.indexOfFirst { it.id == messageId }
        if (index != -1) {
            val oldMessage = _messages[index]
            _messages[index] = oldMessage.copy(content = oldMessage.content + remainingDelta, isStreaming = false)
            updateDisplayMessages()
        }
    }
    streamingMessageId = null
    _uiState.value = ChatViewModel.UiState.Success(
        messages = _messages.toList(), toolCalls = _toolCalls.toList(),
        executionStatus = ExecutionStatus(
            status = if (event.stopReason == "end_turn") "completed" else "running",
            currentTurn = event.iteration, maxTurns = 20,
            progress = if (event.stopReason == "end_turn") 100 else 50
        )
    )
}

private fun ChatViewModel.handleMessageSaved(event: WebSocketManager.WebSocketEvent.MessageSaved) {
    if (event.role == "user") {
        val lastUserMsgIndex = _messages.indexOfLast { it.role == "user" }
        if (lastUserMsgIndex != -1) {
            val oldMsg = _messages[lastUserMsgIndex]
            if (oldMsg.id != event.messageId) {
                _messages[lastUserMsgIndex] = oldMsg.copy(id = event.messageId)
            }
        }
    }
}

private fun ChatViewModel.handleContentBlockStart(event: WebSocketManager.WebSocketEvent.ContentBlockStart) {
    if (event.blockType == "thinking") {
        currentThinkingBlockIndex = event.index
    }
}

private fun ChatViewModel.handleContentBlockDelta(event: WebSocketManager.WebSocketEvent.ContentBlockDelta) {
    if (event.deltaType == "thinking_delta" && event.thinking != null) {
        val existing = _thinkingContent
        _thinkingContent = if (existing.isNotEmpty()) {
            "$existing${event.thinking}"
        } else {
            event.thinking
        }
    }
}

private fun ChatViewModel.handleToolUse(event: WebSocketManager.WebSocketEvent.ToolUse) {
    _toolCalls.add(ToolCall(
        id = event.id, toolName = event.name, toolInput = JsonObject(emptyMap()),
        toolOutput = null, status = "pending", createdAt = System.currentTimeMillis().toString()
    ))
    pendingToolInput[event.id] = StringBuilder()
    streamingMessageId?.let { messageId ->
        messageToToolCalls.getOrPut(messageId) { mutableListOf() }.add(event.id)
    } ?: run { unassociatedToolCallIds.add(event.id) }
    updateMessageToolCallMap()
    emitUiStateUpdate()
}

private fun ChatViewModel.handleToolInputDelta(event: WebSocketManager.WebSocketEvent.ToolInputDelta) {
    pendingToolInput[event.id]?.append(event.partialJson)
}

private fun ChatViewModel.handleToolStart(event: WebSocketManager.WebSocketEvent.ToolStart) {
    val index = _toolCalls.indexOfFirst { it.id == event.id }
    if (index != -1) {
        val oldTool = _toolCalls[index]
        val inputJson = pendingToolInput[event.id]?.toString()
        val toolInput: JsonObject = if (!inputJson.isNullOrEmpty()) {
            try {
                when (val element = json.parseToJsonElement(inputJson)) {
                    is JsonObject -> element
                    else -> JsonObject(emptyMap())
                }
            } catch (_: Exception) { JsonObject(emptyMap()) }
        } else { (event.input as? JsonObject) ?: JsonObject(emptyMap()) }
        scheduleToolUpdate(event.id, oldTool.copy(status = "executing", toolInput = toolInput))
    }
}

private fun ChatViewModel.handleToolEnd(event: WebSocketManager.WebSocketEvent.ToolEnd) {
    val index = _toolCalls.indexOfFirst { it.id == event.id }
    if (index != -1) {
        val oldTool = _toolCalls[index]
        scheduleToolUpdate(event.id, oldTool.copy(
            status = "completed", toolOutput = event.result,
            completedAt = System.currentTimeMillis().toString()
        ))
    }
    pendingToolInput.remove(event.id)
}

private fun ChatViewModel.handleToolError(event: WebSocketManager.WebSocketEvent.ToolError) {
    val index = _toolCalls.indexOfFirst { it.id == event.id }
    if (index != -1) {
        val oldTool = _toolCalls[index]
        scheduleToolUpdate(event.id, oldTool.copy(
            status = "error", error = event.error,
            completedAt = System.currentTimeMillis().toString()
        ))
    }
    pendingToolInput.remove(event.id)
}

private fun ChatViewModel.handleToolUseEnd(event: WebSocketManager.WebSocketEvent.ToolUseEnd) {
    val index = _toolCalls.indexOfFirst { it.id == event.id }
    if (index != -1) {
        val oldTool = _toolCalls[index]
        val newStatus = if (event.error != null) "error" else "completed"
        scheduleToolUpdate(event.id, oldTool.copy(
            status = newStatus, toolOutput = event.output ?: oldTool.toolOutput,
            error = event.error ?: oldTool.error, completedAt = System.currentTimeMillis().toString()
        ))
    }
}

private fun ChatViewModel.handleToolProgress(event: WebSocketManager.WebSocketEvent.ToolProgress) {
    val index = _toolCalls.indexOfFirst { it.id == event.id }
    if (index != -1) {
        val oldTool = _toolCalls[index]
        val existingOutput = oldTool.progressOutput ?: ""
        val newOutput = if (event.output != null) {
            val separator = if (existingOutput.isNotEmpty()) "\n" else ""
            "$existingOutput$separator${event.output}"
        } else {
            existingOutput
        }
        scheduleToolUpdate(event.id, oldTool.copy(
            status = "executing",
            progressOutput = newOutput
        ))
    }
}

private fun ChatViewModel.handleConversationEnd() {
    _uiState.value = ChatViewModel.UiState.Success(
        messages = _messages.toList(), toolCalls = _toolCalls.toList(),
        executionStatus = ExecutionStatus(status = "completed", currentTurn = 0, maxTurns = 20, progress = 100)
    )
}

private fun ChatViewModel.handleErrorEvent(event: WebSocketManager.WebSocketEvent.Error) {
    _uiState.value = ChatViewModel.UiState.Error(event.message)
}

private fun ChatViewModel.handleAgentPush(event: WebSocketManager.WebSocketEvent.AgentPush) {
    notificationManager?.showAgentPushNotification(event.message)
    pushMessageStore?.addMessage(event.message)
}

private fun ChatViewModel.handleTaskStatusChanged(event: WebSocketManager.WebSocketEvent.TaskStatusChanged) {
    val payload = event.payload
    val existingIndex = _tasks.indexOfFirst { it.taskId == payload.taskId }
    val now = System.currentTimeMillis()

    if (existingIndex != -1) {
        val existing = _tasks[existingIndex]
        _tasks[existingIndex] = existing.copy(
            status = payload.newStatus,
            result = payload.result ?: existing.result,
            error = payload.error ?: existing.error,
            startedAt = if (payload.newStatus == "running") now else existing.startedAt,
            completedAt = if (payload.newStatus == "completed" || payload.newStatus == "failed" || payload.newStatus == "cancelled") now else existing.completedAt
        )
    } else {
        _tasks.add(BackgroundTask(
            taskId = payload.taskId,
            taskName = payload.taskName,
            status = payload.newStatus,
            createdAt = now,
            startedAt = if (payload.newStatus == "running") now else null,
            completedAt = if (payload.newStatus == "completed" || payload.newStatus == "failed" || payload.newStatus == "cancelled") now else null,
            result = payload.result,
            error = payload.error
        ))
    }

    if (payload.newStatus == "completed") {
        _collapsedTasks[payload.taskId] = true
    }

    updateDisplayMessages()
    emitUiStateUpdate()
}
