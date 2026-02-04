'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ImageAttachmentPayload } from '@/lib/types';

interface ChatInputProps {
  onSend: (message: string, attachments?: ImageAttachmentPayload[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

interface AttachmentItem extends ImageAttachmentPayload {
  id: string;
  previewUrl: string;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((trimmed.length === 0 && attachments.length === 0) || isStreaming || disabled) return;
    onSend(trimmed, attachments.map(({ data, mediaType, name }) => ({ data, mediaType, name })));
    setText('');
    setAttachments([]);
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, attachments, isStreaming, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const next: Promise<AttachmentItem>[] = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve({
              id: `${file.name}-${file.size}-${Date.now()}`,
              name: file.name,
              mediaType: file.type || 'image/png',
              data: base64,
              previewUrl: result.startsWith('data:') ? result : `data:${file.type};base64,${base64}`,
            });
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      });

    Promise.all(next)
      .then((items) => {
        setAttachments((prev) => [...prev, ...items]);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <div className="bg-[var(--bg-primary)] px-4 py-3">
      <div className="max-w-[768px] mx-auto">
        <div className="flex items-end gap-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-4 py-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
            title="Attach image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-8.49 8.49a5 5 0 01-7.07-7.07l8.49-8.49a3 3 0 114.24 4.24l-8.49 8.49a1 1 0 01-1.41-1.41l7.78-7.78" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[15px] leading-relaxed placeholder:text-[var(--text-tertiary)] max-h-[200px]"
          />

          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--error)] text-white hover:opacity-90 transition-opacity"
              title="Stop generating"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(text.trim().length === 0 && attachments.length === 0) || disabled}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1"
              >
                <img
                  src={att.previewUrl}
                  alt={att.name || 'attachment'}
                  className="h-10 w-10 rounded-md object-cover"
                />
                <span className="text-xs text-[var(--text-secondary)] max-w-[140px] truncate">
                  {att.name || 'image'}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  title="Remove"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="text-center mt-2 text-xs text-[var(--text-tertiary)]">
          CloneBot uses local AI models via Ollama
        </div>
      </div>
    </div>
  );
}
