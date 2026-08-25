/**
 * Chat input component.
 * Clean, modern design with subtle focus states.
 * Supports file/image upload via button and drag-and-drop.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, X, FileText, Image, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Quick action templates for smart fill
const QUICK_ACTIONS = [
  { id: 'weight', label: '重量差异', text: '片剂生产线发现重量差异，多批次产品重量超出规定范围...' },
  { id: 'contamination', label: '交叉污染', text: '洁净区环境监测发现微生物超标，可能存在交叉污染风险...' },
  { id: 'equipment', label: '设备故障', text: '生产设备运行异常，关键参数偏离验证范围...' },
  { id: 'document', label: '记录偏差', text: '批生产记录发现数据完整性问题，关键步骤缺少复核...' },
  { id: 'material', label: '物料偏差', text: '原辅料检验结果不符合质量标准，需要进行偏差调查...' },
];

interface AttachedFile {
  id: string;
  name: string;
  type: 'file' | 'image';
  size: number;
  content?: string;
}

interface ChatInputProps {
  onSend: (message: string, files?: AttachedFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = '描述偏差情况，例如：片剂生产线发现重量差异...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if ((message.trim() || attachedFiles.length > 0) && !disabled) {
      onSend(message.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
      setMessage('');
      setAttachedFiles([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 处理文件选择
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles: AttachedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith('image/');

      // 限制文件大小 (20MB for Excel/PDF, 10MB for others)
      const maxSize = (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.pdf'))
        ? 20 * 1024 * 1024
        : 10 * 1024 * 1024;

      if (file.size > maxSize) {
        continue;
      }

      // 读取文件内容
      const content = await readFileContent(file);

      newFiles.push({
        id: `file-${Date.now()}-${i}`,
        name: file.name,
        type: isImage ? 'image' : 'file',
        size: file.size,
        content,
      });
    }

    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // 读取文件内容
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // 移除附件
  const removeFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // 拖放处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleQuickAction = (text: string) => {
    setMessage(text);
    setShowQuickActions(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="px-5 pb-4 pt-2">
      {/* Quick actions */}
      {showQuickActions && !disabled && (
        <div className="mb-2.5 p-2 bg-stone-50 rounded-lg border border-stone-200/60">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] font-medium text-stone-500">快速填充</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.text)}
                className="px-2.5 py-1 bg-stone-50/80 border border-stone-200/40 rounded-lg text-[11px] text-stone-500 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 hover:scale-[1.03] active:scale-[0.97] transition-all duration-150"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 附件列表 */}
      {attachedFiles.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-50 border border-stone-200/60 rounded-md text-[11px]"
            >
              {file.type === 'image' ? (
                <Image className="w-3 h-3 text-stone-400" />
              ) : (
                <FileText className="w-3 h-3 text-stone-400" />
              )}
              <span className="text-stone-600 max-w-[100px] truncate">{file.name}</span>
              <span className="text-stone-400">({formatSize(file.size)})</span>
              <button
                onClick={() => removeFile(file.id)}
                className="p-0.5 hover:bg-stone-200 rounded transition-colors"
              >
                <X className="w-2.5 h-2.5 text-stone-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div
        className={`
          flex items-end gap-2.5 p-3 rounded-xl
          bg-white border shadow-sm
          transition-all duration-200 ease-out
          hover:border-stone-300 hover:shadow-md
          ${isDragging ? 'border-teal-400 bg-teal-50/30 scale-[1.01]' : ''}
          ${disabled ? 'opacity-50' : 'focus-within:border-teal-300 focus-within:shadow-md focus-within:shadow-teal-50/40'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Quick actions button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowQuickActions(!showQuickActions)}
          disabled={disabled}
          className={`flex-shrink-0 ${showQuickActions ? 'text-teal-600' : 'text-stone-400 hover:text-stone-600'}`}
          title="快速填充"
        >
          <Zap className="w-4 h-4" strokeWidth={1.5} />
        </Button>

        {/* 附件按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 text-stone-400 hover:text-stone-600"
          title="添加附件"
        >
          <Paperclip className="w-4 h-4" strokeWidth={1.5} />
        </Button>

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.txt,.md,.csv,.pdf,.doc,.docx,.xlsx,.xls"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="
            flex-1 resize-none border-0 outline-none text-[13px] text-stone-800
            placeholder:text-stone-400 bg-transparent
            min-h-[24px] max-h-[120px] py-1.5
          "
        />

        <Button
          variant="primary"
          size="icon"
          onClick={handleSubmit}
          disabled={(!message.trim() && attachedFiles.length === 0) || disabled}
          className="flex-shrink-0 rounded-lg hover:scale-105 active:scale-95 transition-transform duration-150"
        >
          <Send className="w-3.5 h-3.5" strokeWidth={2} />
        </Button>
      </div>

      {/* 底部提示 */}
      <p className="text-[11px] text-stone-400 text-center mt-2 select-none">
        Enter 发送 · Shift+Enter 换行
      </p>
      <p className="text-[10px] text-stone-400 text-center mt-1 select-none">
        基于 EU GMP / 中国 GMP 法规库 · 结果需经 QA 审核
      </p>
    </div>
  );
}
