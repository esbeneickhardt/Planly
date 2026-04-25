import { ReactNode } from 'react';
import Sidebar from './Sidebar';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
    </div>
  );
}
