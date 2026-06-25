import { ReactNode, useState, useEffect } from 'react';
import TopBar from './TopBar';
import SearchModal from './SearchModal';
import ChatPanel from './ChatPanel';

export default function AppLayout({ children }: { children: ReactNode }) {
  const [showSearch, setShowSearch] = useState(false);
  const [showProductChat, setShowProductChat] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true); }
      if (e.key === 'Escape') setShowSearch(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <TopBar onOpenSearch={() => setShowSearch(true)} onOpenChat={() => setShowProductChat((v) => !v)} chatOpen={showProductChat} />
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showProductChat && <ChatPanel onClose={() => setShowProductChat(false)} />}
    </div>
  );
}
