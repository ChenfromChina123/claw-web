/**
 * SessionSwitcher - IDE 终端会话切换器组件
 * 
 * 在 IDE 的 AI AGENT 聊天界面中提供会话管理功能。
 * 支持键盘导航、搜索过滤和快速切换会话。
 * 
 * 快捷键：
 * - Ctrl+L 或 Cmd+L: 打开/关闭会话切换器
 * - ↑/↓: 导航会话列表
 * - Enter: 切换到选中的会话
 * - Esc: 关闭切换器
 * - /: 进入搜索模式
 */

import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdin } from '../ink.js';
import type { Session } from '../types/session.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import { getSessionId, switchSession } from '../bootstrap/state.js';
import { asSessionId } from '../types/ids.js';
import { useNotifications } from '../context/notifications.js';

interface SessionSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SessionInfo {
  id: string;
  title: string;
  updatedAt: Date;
  isCurrent: boolean;
}

export function SessionSwitcher({ isOpen, onClose }: SessionSwitcherProps): React.ReactElement | null {
  const { exit } = useApp();
  const { stdin } = useStdin();
  const setAppState = useSetAppState();
  const { addNotification } = useNotifications();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  
  // 从 AppState 获取会话列表
  const sessions = useAppState(s => s.sessions || []);
  const currentSessionId = useAppState(() => getSessionId());
  
  // 转换会话数据
  const sessionInfos: SessionInfo[] = useMemo(() => {
    return sessions.map((session: Session) => ({
      id: session.id,
      title: session.title || '未命名会话',
      updatedAt: new Date(session.updatedAt),
      isCurrent: session.id === currentSessionId,
    })).sort((a, b) => {
      // 当前会话排在最前面
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      // 然后按更新时间倒序
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }, [sessions, currentSessionId]);
  
  // 过滤会话
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessionInfos;
    const query = searchQuery.toLowerCase();
    return sessionInfos.filter(s => 
      s.title.toLowerCase().includes(query) ||
      s.id.toLowerCase().includes(query)
    );
  }, [sessionInfos, searchQuery]);
  
  // 重置选中索引当过滤结果变化时
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredSessions.length]);
  
  // 处理键盘输入
  useInput((input, key) => {
    if (!isOpen) return;
    
    if (isSearchMode) {
      // 搜索模式
      if (key.escape) {
        setIsSearchMode(false);
        setSearchQuery('');
      } else if (key.return) {
        setIsSearchMode(false);
        if (filteredSessions[selectedIndex]) {
          handleSelectSession(filteredSessions[selectedIndex]);
        }
      } else if (key.backspace || key.delete) {
        setSearchQuery(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery(prev => prev + input);
      }
    } else {
      // 正常模式
      if (key.escape) {
        onClose();
      } else if (input === '/') {
        setIsSearchMode(true);
        setSearchQuery('');
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(filteredSessions.length - 1, prev + 1));
      } else if (key.return) {
        if (filteredSessions[selectedIndex]) {
          handleSelectSession(filteredSessions[selectedIndex]);
        }
      } else if (key.tab) {
        // Tab 键循环选择
        setSelectedIndex(prev => (prev + 1) % filteredSessions.length);
      }
    }
  });
  
  const handleSelectSession = useCallback((session: SessionInfo) => {
    if (session.isCurrent) {
      addNotification({
        key: 'session-switch-same',
        jsx: <Text dimColor>已在当前会话中</Text>,
        priority: 'immediate',
        timeoutMs: 2000,
      });
      onClose();
      return;
    }
    
    // 切换会话
    switchSession(asSessionId(session.id));
    
    addNotification({
      key: 'session-switched',
      jsx: <Text color="green">已切换到会话: {session.title}</Text>,
      priority: 'immediate',
      timeoutMs: 3000,
    });
    
    onClose();
  }, [onClose, addNotification]);
  
  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };
  
  if (!isOpen) return null;
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      {/* 标题栏 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          会话管理
        </Text>
        <Text dimColor> (</Text>
        <Text color="yellow">{filteredSessions.length}</Text>
        <Text dimColor> 个会话)</Text>
      </Box>
      
      {/* 搜索栏 */}
      <Box marginBottom={1}>
        {isSearchMode ? (
          <Text>
            <Text color="yellow">搜索:</Text>
            <Text> {searchQuery}</Text>
            <Text color="cyan">_</Text>
          </Text>
        ) : (
          <Text dimColor>
            按 <Text color="yellow">/</Text> 搜索, <Text color="yellow">↑↓</Text> 导航, <Text color="yellow">Enter</Text> 切换, <Text color="yellow">Esc</Text> 关闭
          </Text>
        )}
      </Box>
      
      {/* 会话列表 */}
      <Box flexDirection="column">
        {filteredSessions.length === 0 ? (
          <Text dimColor>没有找到匹配的会话</Text>
        ) : (
          filteredSessions.slice(0, 10).map((session, index) => (
            <Box key={session.id}>
              <Text>
                {index === selectedIndex ? (
                  <Text color="cyan">{'>'}</Text>
                ) : (
                  <Text> </Text>
                )}
                {' '}
                {session.isCurrent ? (
                  <Text color="green" bold>●</Text>
                ) : (
                  <Text dimColor>○</Text>
                )}
                {' '}
                <Text 
                  color={index === selectedIndex ? 'cyan' : undefined}
                  bold={index === selectedIndex}
                >
                  {session.title.length > 40 
                    ? session.title.slice(0, 37) + '...' 
                    : session.title}
                </Text>
                <Text dimColor> ({formatTime(session.updatedAt)})</Text>
              </Text>
            </Box>
          ))
        )}
        
        {filteredSessions.length > 10 && (
          <Box marginTop={1}>
            <Text dimColor>
              ... 还有 {filteredSessions.length - 10} 个会话
            </Text>
          </Box>
        )}
      </Box>
      
      {/* 底部提示 */}
      <Box marginTop={1}>
        <Text dimColor>
          当前会话: <Text color="green">{sessionInfos.find(s => s.isCurrent)?.title || '未命名'}</Text>
        </Text>
      </Box>
    </Box>
  );
}

export default SessionSwitcher;
