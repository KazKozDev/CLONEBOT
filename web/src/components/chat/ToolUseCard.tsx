'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import type { ToolCallDisplay } from '@/lib/types';

interface ToolUseCardProps {
  tool: ToolCallDisplay;
}

export function ToolUseCard({ tool }: ToolUseCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'border rounded-lg mb-2 overflow-hidden transition-colors',
        tool.status === 'running' && 'border-blue-400/50 bg-blue-400/5',
        tool.status === 'completed' && 'border-[var(--success)]/30 bg-[var(--success)]/5',
        tool.status === 'error' && 'border-[var(--error)]/30 bg-[var(--error)]/5'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--bg-tertiary)]/50 transition-colors"
      >
        {tool.status === 'running' && <Spinner size={14} />}
        {tool.status === 'completed' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
        {tool.status === 'error' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        )}
        <span className="font-medium text-[var(--text-secondary)]">{tool.name}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn('ml-auto transition-transform', expanded && 'rotate-180')}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 text-xs">
          <div className="mb-2">
            <span className="text-[var(--text-tertiary)]">Arguments:</span>
            <pre className="mt-1 !p-2 !text-xs">
              {JSON.stringify(tool.arguments, null, 2)}
            </pre>
          </div>
          {tool.result !== undefined && (
            <div>
              <span className="text-[var(--text-tertiary)]">Result:</span>
              <pre className="mt-1 !p-2 !text-xs">
                {typeof tool.result === 'string'
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
          {tool.error && (
            <div className="text-[var(--error)]">Error: {tool.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
