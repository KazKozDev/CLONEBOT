import { Sidebar } from '@/components/sidebar/Sidebar';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {children}
      </main>
    </div>
  );
}
