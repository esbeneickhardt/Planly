/**
 * Full-page welcome screen shown when the user has no projects yet.
 * Displays the Plan → Execute → Progress flow and offers two entry points:
 * loading example projects (admins/owners only) or creating a new project.
 */
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProduct } from '../../context/ProductContext';
import Modal from './Modal';
import EmojiPicker from './EmojiPicker';
import SeedDataModal from './SeedDataModal';
import DiscoverProjectsModal from './DiscoverProjectsModal';
import MarkdownEditor from './MarkdownEditor';

const PHASES = [
  {
    icon: '🗺️',
    label: 'Plan',
    color: 'var(--brand)',
    heading: 'Map your work as a graph',
    body: 'Create tasks and connect them with dependency arrows. Place milestones at the end of chains so you can see what needs to finish first.',
  },
  {
    icon: '⚡',
    label: 'Execute',
    color: '#f59e0b',
    heading: 'Work sub-plan by sub-plan',
    body: 'Pull tasks into sub-plans and move them across board columns. A milestone progress bar shows how close you are to each deadline.',
  },
  {
    icon: '📊',
    label: 'Progress',
    color: '#10b981',
    heading: 'Track milestones on a timeline',
    body: 'The Gantt view shows every milestone as a horizontal bar, coloured by health. Hover to see which tasks are blocking it.',
  },
];

interface ProductForm {
  name: string;
  emoji: string;
  description: string;
  deadline: string;
}

export default function NoProjectsWelcome() {
  const { user } = useAuth();
  const { createProduct, refreshProducts } = useProduct();
  const isAdmin = !!user?.isAdmin;

  const [showNewProject, setShowNewProject] = useState(false);
  const [showSeedData, setShowSeedData] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [form, setForm] = useState<ProductForm>({ name: '', emoji: '', description: '', deadline: '' });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  function setField(f: keyof ProductForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [f]: e.target.value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await createProduct({
        name: form.name,
        emoji: form.emoji || undefined,
        description: form.description || undefined,
        deadline: form.deadline,
      });
      setShowNewProject(false);
      setShowEmojiPicker(false);
      setForm({ name: '', emoji: '', description: '', deadline: '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl overflow-hidden mx-auto mb-4">
            <img src="/icons/p.png" alt="Planly" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
            Welcome to Planly
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Three views, one coherent pipeline from planning to delivery.
          </p>
        </div>

        {/* The flow */}
        <div className="space-y-3 mb-10">
          {PHASES.map((phase) => (
            <div
              key={phase.label}
              className="rounded-2xl p-4"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: phase.color }}>
                {phase.label}
              </p>
              <p className="text-sm font-semibold leading-snug mb-0.5" style={{ color: 'var(--text)' }}>
                {phase.heading}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                {phase.body}
              </p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          {isAdmin ? (
            <>
              <button onClick={() => setShowSeedData(true)} className="btn-secondary flex items-center gap-2 px-5">
                <span>✦</span> Load examples
              </button>
              <button onClick={() => setShowNewProject(true)} className="btn-primary flex items-center gap-2 px-5">
                <span>＋</span> Create project
              </button>
            </>
          ) : (
            <button onClick={() => setShowDiscover(true)} className="btn-primary flex items-center gap-2 px-5">
              <span>🔭</span> Join a project
            </button>
          )}
        </div>
      </div>

      {/* New project modal */}
      {showNewProject && (
        <Modal
          title="New project"
          onClose={() => {
            setShowNewProject(false);
            setShowEmojiPicker(false);
          }}
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <label className="label">Icon</label>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors"
                  style={{
                    background: showEmojiPicker ? 'var(--brand-subtle)' : 'var(--surface-2)',
                    border: `1px solid ${showEmojiPicker ? 'var(--brand)' : 'var(--border)'}`,
                  }}
                >
                  {form.emoji || '🎯'}
                </button>
              </div>
              <div className="flex-1">
                <label className="label">Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={setField('name')}
                  className="input"
                  placeholder="My Project"
                  autoFocus
                />
              </div>
            </div>
            {showEmojiPicker && (
              <div>
                <EmojiPicker
                  value={form.emoji}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, emoji: e }));
                    setShowEmojiPicker(false);
                  }}
                />
                {form.emoji && (
                  <button
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, emoji: '' })); setShowEmojiPicker(false); }}
                    className="mt-1 w-full text-xs py-1 rounded-lg"
                    style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
                  >
                    Remove icon
                  </button>
                )}
              </div>
            )}
            <div>
              <label className="label">Description</label>
              <MarkdownEditor
                value={form.description}
                onChange={(v) => setForm((prev) => ({ ...prev, description: v }))}
                rows={4}
                placeholder="What's the vision?"
              />
            </div>
            <div>
              <label className="label">Target deadline</label>
              <input type="date" required value={form.deadline} onChange={setField('deadline')} className="input" />
            </div>
            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Create project'
                )}
              </button>
              <button type="button" onClick={() => setShowNewProject(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showSeedData && (
        <SeedDataModal onClose={() => setShowSeedData(false)} onSuccess={refreshProducts} />
      )}

      {showDiscover && (
        <DiscoverProjectsModal onClose={() => setShowDiscover(false)} />
      )}
    </div>
  );
}
