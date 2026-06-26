/**
 * Chat input component.
 * Clean, modern design with subtle focus states.
 * Supports file/image upload via button and drag-and-drop.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, X, FileText, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="px-6 pb-6 pt-2">
      {/* 附件列表 */}
      {attachedFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 rounded-lg text-xs"
            >
              {file.type === 'image' ? (
                <Image className="w-3.5 h-3.5 text-stone-500" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-stone-500" />
              )}
              <span className="text-stone-700 max-w-[120px] truncate">{file.name}</span>
              <span className="text-stone-400">({formatSize(file.size)})</span>
              <button
                onClick={() => removeFile(file.id)}
                className="p-0.5 hover:bg-stone-200 rounded transition-colors"
              >
                <X className="w-3 h-3 text-stone-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div
        className={`
          flex items-end gap-3 p-3.5 rounded-2xl
          bg-white border transition-all duration-200
          ${isDragging ? 'border-teal-400 bg-teal-50/50' : 'border-stone-200'}
          ${disabled ? 'opacity-60' : 'focus-within:border-teal-300 focus-within:shadow-sm focus-within:shadow-teal-500/5'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 附件按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0"
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
            flex-1 resize-none border-0 outline-none text-sm text-stone-800
            placeholder:text-stone-400 bg-transparent
            min-h-[24px] max-h-[120px] py-2
            font-body
          "
        />

        <Button
          variant="primary"
          size="icon"
          onClick={handleSubmit}
          disabled={(!message.trim() && attachedFiles.length === 0) || disabled}
          className={disabled ? 'animate-pulse' : ''}
        >
          <Send className="w-4 h-4" strokeWidth={2} />
        </Button>
      </div>

      <p className="text-[11px] text-stone-400 text-center mt-3 tracking-wide">
        Enter 发送 · Shift + Enter 换行 · 支持拖放文件
      </p>
    </div>
  );
}
