import { SessionInfo } from '@/lib/types';
import { formatTime } from '@/lib/utils';

interface SessionTableProps {
  sessions: SessionInfo[];
}

export function SessionTable({ sessions }: SessionTableProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
              Session ID
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
              Created
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
              Last Updated
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
              Messages
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sessions.map((session) => (
            <tr key={session.sessionId} className="hover:bg-accent/50">
              <td className="px-4 py-3 text-sm font-mono text-foreground">
                {session.sessionId}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {formatTime(session.metadata.createdAt)}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {formatTime(session.metadata.updatedAt)}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {session.metadata.messageCount ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
