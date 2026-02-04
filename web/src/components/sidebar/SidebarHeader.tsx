'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useChatStore } from '@/stores/chat-store';

export function SidebarHeader() {
  const router = useRouter();
  const resetChat = useChatStore((state) => state.reset);

  const handleNewChat = () => {
    resetChat();
    router.push('/chat');
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-border">
      <h1 className="text-xl font-semibold text-foreground">CLONEBOT</h1>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleNewChat}
        className="gap-2"
      >
        <Plus className="w-4 h-4" />
        New
      </Button>
    </div>
  );
}
