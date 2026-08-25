/**
 * Chat history floating panel component.
 * 从左侧滑出的浮层，不占用常驻宽度（方案 A：两栏收敛）。
 */

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Trash2, Plus, Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ErrorState } from '../ui/error-state';
import { createLogger } from '@core/utils/logger';

const log = createLogger('ChatHistory');

interface Conversation {
  id: number;
  title: string;
  messages_json: string;
  created_at: string;
  updated_at: string;
}

interface ChatHistoryProps {
  currentConversationId?: number | null;
  onSelectConversation?: (id: number) => void;
  onNewConversation?: () => void;
  onClose?: () => void;
}

export function ChatHistory({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onClose,
}: ChatHistoryProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const result = await window.gmpilot.db.getConversations({ limit: 50 });
      setConversations(result);
    } catch (error) {
      log.error('Failed to load conversations', { error: String(error) });
      setLoadError(error instanceof Error ? error.message : '历史对话加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.gmpilot.db.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      log.error('Failed to delete conversation', { error: String(error) });
    }
  };

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    return conv.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const getMessagePreview = (messagesJson: string): string => {
    try {
      const messages = JSON.parse(messagesJson);
      if (Array.isArray(messages) && messages.length > 0) {
        const lastUserMsg = messages.filter((m: { role: string }) => m.role === 'user').pop();
        if (lastUserMsg && 'content' in lastUserMsg) {
          const content = String(lastUserMsg.content);
          return content.length > 40 ? content.slice(0, 40) + '...' : content;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return '新对话';
  };

  return (
    <div className="flex flex-col h-full bg-surface border-r border-stone-200/60">
      {/* Header — title + close */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-stone-100">
        <h3 className="text-[13px] font-medium text-stone-700">历史对话</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="w-6 h-6"
          title="关闭历史对话"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Search + new conversation — one row */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-stone-100">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-stone-400" />
          <Input
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNewConversation}
          className="h-8 px-2.5 flex-shrink-0"
          title="新建对话"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <ErrorState title="历史对话加载失败" description={loadError} onRetry={loadConversations} retryLabel="重试" className="py-8" />
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-stone-400">
            <MessageSquare className="w-7 h-7 mb-2 opacity-40" />
            <p className="text-xs">暂无对话记录</p>
          </div>
        ) : (
          <div className="py-1.5">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelectConversation?.(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectConversation?.(conv.id);
                }}
                className={`
                  group flex items-center gap-2 px-3 py-2.5 cursor-pointer
                  transition-all duration-150
                  ${currentConversationId === conv.id
                    ? 'bg-teal-50 border-l-2 border-teal-500'
                    : 'hover:bg-stone-50 hover:translate-x-[1px] border-l-2 border-transparent'
                  }
                `}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-stone-700 truncate">
                      {conv.title}
                    </p>
                    <span className="text-[10px] text-stone-400 flex-shrink-0">
                      {formatDate(conv.updated_at)}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 truncate mt-0.5">
                    {getMessagePreview(conv.messages_json)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="删除对话"
                >
                  <Trash2 className="w-3 h-3 text-stone-400" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
