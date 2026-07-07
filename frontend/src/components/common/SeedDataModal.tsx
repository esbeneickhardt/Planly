import { useState } from 'react';
import Modal from './Modal';
import { api } from '../../api/client';

interface Props {
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export default function SeedDataModal({ onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLoad() {
    setLoading(true);
    setError('');
    try {
      await api.seed.examples();
      await onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <Modal title="Load example projects" onClose={onClose} width="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          This will add 2 example projects to your workspace so you can explore Planly with realistic data.
        </p>
        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={handleLoad} disabled={loading} className="btn-primary flex-1 flex justify-center">
            {loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Load examples'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
