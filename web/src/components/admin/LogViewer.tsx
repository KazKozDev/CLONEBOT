'use client';

import { useState, useEffect } from 'react';
import { Toggle } from '@/components/ui/Toggle';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    // Mock logs - replace with actual API call
    const interval = setInterval(() => {
      const newLog: LogEntry = {
        timestamp: new Date().toISOString(),
        level: ['info', 'warn', 'error'][Math.floor(Math.random() * 3)],
        message: `Sample log message ${Date.now()}`,
      };
      setLogs((prev) => [...prev.slice(-99), newLog]);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const filteredLogs =
    filter === 'all' ? logs : logs.filter((log) => log.level === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-background text-foreground"
        >
          <option value="all">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <Toggle
          checked={autoScroll}
          onChange={setAutoScroll}
          label="Auto-scroll"
        />
      </div>

      <div className="h-96 overflow-auto border border-border rounded-lg bg-card p-4 font-mono text-sm">
        {filteredLogs.map((log, index) => (
          <div key={index} className="py-1">
            <span className="text-muted-foreground">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={`ml-2 ${
                log.level === 'error'
                  ? 'text-red-500'
                  : log.level === 'warn'
                  ? 'text-yellow-500'
                  : 'text-blue-500'
              }`}
            >
              [{log.level.toUpperCase()}]
            </span>
            <span className="ml-2 text-foreground">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
