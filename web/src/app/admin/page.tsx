'use client';

import { useEffect } from 'react';
import { useAdmin } from '@/hooks/useAdmin';
import { StatusCard } from '@/components/admin/StatusCard';
import { Spinner } from '@/components/ui/Spinner';

export default function AdminPage() {
  const { stats, isLoading, fetchStats, fetchHealth } = useAdmin();

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">
          System Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatusCard
            title="Total Sessions"
            value={stats?.totalSessions ?? 0}
          />
          <StatusCard
            title="Active Sessions"
            value={stats?.activeSessions ?? 0}
          />
          <StatusCard
            title="Total Messages"
            value={stats?.totalMessages ?? 0}
          />
          <StatusCard
            title="Uptime"
            value={`${Math.floor((stats?.uptime ?? 0) / 3600)}h`}
          />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Memory Usage
        </h2>
        <StatusCard
          title="Heap Used"
          value={`${Math.round((stats?.memoryUsage ?? 0) / 1024 / 1024)} MB`}
        />
      </div>
    </div>
  );
}
