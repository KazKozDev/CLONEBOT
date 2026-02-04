'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Sessions', href: '/admin/sessions' },
  { name: 'Logs', href: '/admin/logs' },
  { name: 'Config', href: '/admin/config' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border bg-background">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        </div>
        <nav className="flex gap-4 px-6">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'px-4 py-2 border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
