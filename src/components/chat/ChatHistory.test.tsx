import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatHistory } from './ChatHistory';

// Mock window.gmpilot
vi.stubGlobal('gmpilot', {
  db: {
    getConversations: vi.fn().mockResolvedValue([]),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  },
});

describe('ChatHistory', () => {
  const defaultProps = {
    currentConversationId: null,
    onSelectConversation: vi.fn(),
    onNewConversation: vi.fn(),
    onClose: vi.fn(),
  };

  it('should render empty state', async () => {
    render(<ChatHistory {...defaultProps} />);
    await vi.waitFor(() => {
      expect(screen.getByText('暂无对话记录')).toBeInTheDocument();
    });
  });

  it('should render new conversation button', () => {
    render(<ChatHistory {...defaultProps} />);
    expect(screen.getByTitle('新建对话')).toBeInTheDocument();
  });

  it('should render search input', () => {
    render(<ChatHistory {...defaultProps} />);
    expect(screen.getByPlaceholderText('搜索对话...')).toBeInTheDocument();
  });

  it('should render close button', () => {
    render(<ChatHistory {...defaultProps} />);
    expect(screen.getByTitle('关闭历史对话')).toBeInTheDocument();
  });

  it('should render header title', () => {
    render(<ChatHistory {...defaultProps} />);
    expect(screen.getByText('历史对话')).toBeInTheDocument();
  });
});
