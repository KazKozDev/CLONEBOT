'use client';

import { MessageSquare, Trash2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { SessionInfo } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { IconButton } from '@/components/ui/IconButton';
import { useState } from 'react';

interface SidebarItemProps {
  session: SessionInfo;
  onDelete: (sessionId: string) => void;
}

export function SidebarItem({ session, onDelete }: SidebarItemProps) {
  const router = useRouter();
  const params = useParams();
  const [isHovered, setIsHovered] = useState(false);
  
  const isActive = params.sessionId === session.sessionId;

  const handleClick = () => {
    router.push(`/chat/${session.sessionId}`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      onDelete(session.sessionId);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
      }`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {session.metadata?.sessionId || 'Untitled'}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatTime(session.metadata.createdAt)}
        </div>
      </div>
      {isHovered && (
        <IconButton
          icon={Trash2}
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100"
          size="sm"
        />
      )}
    </div>
  );
}
