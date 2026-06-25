import { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../../api/client';
import type { Product } from '../../types';

type DiscoverProduct = Product & { requestStatus: string | null; team: { id: string; name: string } };

export default function DiscoverProjectsModal({ onClose }: { onClose: () => void }) {
  const [products, setProducts] = useState<DiscoverProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setLoading(true);
    api.accessRequests
      .discover()
      .then((ps) => {
        setProducts(ps as DiscoverProduct[]);
        const initial: Record<string, string | null> = {};
        (ps as DiscoverProduct[]).forEach((p) => { initial[p.id] = p.requestStatus; });
        setStatusMap(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.team?.name?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleRequest(productId: string) {
    const note = noteMap[productId] ?? '';
    setRequesting(productId);
    try {
      await api.accessRequests.request(productId, note || undefined);
      setStatusMap((prev) => ({ ...prev, [productId]: 'pending' }));
      setShowNoteFor(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRequesting(null);
    }
  }

  function statusBadge(status: string | null) {
    if (status === 'pending') {
      return (
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          Pending
        </span>
      );
    }
    if (status === 'approved') {
      return (
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
        >
          Approved
        </span>
      );
    }
    return null;
  }

  return (
    <Modal title="Find projects" onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="input w-full text-sm"
        />

        {loading ? (
          <div className="flex items-center justify-center py-10" style={{ color: 'var(--text-3)' }}>
            <span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: 'var(--text-3)' }}>
            <span className="text-3xl opacity-30">🔍</span>
            <p className="text-sm">{search ? 'No projects match your search.' : 'No discoverable projects found.'}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {filtered.map((p) => {
              const status = statusMap[p.id];
              const isShowingNote = showNoteFor === p.id;
              return (
                <div
                  key={p.id}
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl flex-shrink-0">{p.emoji ?? '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{p.team?.name}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {status ? (
                        statusBadge(status)
                      ) : (
                        <button
                          onClick={() => setShowNoteFor(isShowingNote ? null : p.id)}
                          className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
                          style={{ background: 'var(--brand-subtle)', color: 'var(--brand)', border: '1px solid var(--brand)' }}
                        >
                          Request access
                        </button>
                      )}
                    </div>
                  </div>

                  {isShowingNote && !status && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        rows={2}
                        value={noteMap[p.id] ?? ''}
                        onChange={(e) => setNoteMap((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="Add a note (optional)…"
                        className="input text-sm w-full resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRequest(p.id)}
                          disabled={requesting === p.id}
                          className="btn-primary text-xs px-4"
                        >
                          {requesting === p.id ? '…' : 'Send request'}
                        </button>
                        <button
                          onClick={() => setShowNoteFor(null)}
                          className="btn-secondary text-xs px-3"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
