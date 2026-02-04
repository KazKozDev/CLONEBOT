'use client';

import { useSessions } from '@/hooks/useSessions';
import { SidebarHeader } from './SidebarHeader';
import { SidebarItem } from './SidebarItem';
import { Spinner } from '@/components/ui/Spinner';

export function Sidebar() {
  const { sessions, loading, deleteSession } = useSessions();

  return (
    <div className="w-64 h-full bg-background border-r border-border flex flex-col">
      <SidebarHeader />
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner size={16} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm p-4">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <SidebarItem
                key={session.sessionId}
                session={session}
                onDelete={deleteSession}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
