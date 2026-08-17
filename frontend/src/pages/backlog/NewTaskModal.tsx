/** Quick-add modal: name only, additional fields can be set via TaskDetailPanel afterwards. */
import { useState } from 'react';
import { useProduct } from '../../context/ProductContext';
import Modal from '../../components/common/Modal';

interface Props {
  onClose: () => void;
}

export default function NewTaskModal({ onClose }: Props) {
  const { createTask } = useProduct();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createTask({ name: name.trim() });
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title="New task" onClose={onClose} width="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="backlog-new-task-name">
            Task name
          </label>
          <input
            id="backlog-new-task-name"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- first field in a freshly-opened modal
            autoFocus
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="What needs to be done?"
          />
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
            {creating ? (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              'Create task'
            )}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
