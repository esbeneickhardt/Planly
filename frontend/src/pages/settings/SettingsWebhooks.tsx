/**
 * Settings Webhooks tab for registering HTTP POST endpoints that fire on project events.
 * Each webhook is HMAC-SHA256 signed; the secret is revealed once at creation time and never
 * shown again.  Webhooks can be individually enabled/disabled without deleting them.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { Webhook } from '../../api/client';
import type { Product } from '../../types';

const WEBHOOK_EVENTS = [
  { value: 'task.created',        label: 'Task created' },
  { value: 'task.updated',        label: 'Task updated' },
  { value: 'task.deleted',        label: 'Task deleted' },
  { value: 'task.status_changed', label: 'Task status changed' },
  { value: 'task.assigned',       label: 'Task assigned' },
  { value: 'sprint.created',      label: 'Sprint created' },
  { value: 'sprint.updated',      label: 'Sprint updated' },
  { value: 'sprint.deleted',      label: 'Sprint deleted' },
  { value: 'message.created',     label: 'Message created' },
];

interface Props {
  activeProduct: Product;
  showToast: (msg: string, type: 'success' | 'error') => void;
  confirm: (msg: string) => Promise<boolean>;
}

export default function SettingsWebhooks({ activeProduct, showToast, confirm }: Props) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setWebhooks(await api.webhooks.list(activeProduct.id)); } catch {}
  }, [activeProduct.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Webhooks</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
          Webhooks send HTTP POST requests to your URL when events happen in this project.
          Each delivery is signed with HMAC-SHA256 using the webhook secret in the <code>X-Planly-Signature</code> header.
        </p>

        {/* Create webhook */}
        <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text)' }}>Add webhook</h3>
          <div className="space-y-3">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="input text-sm w-full"
            />
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Events to send:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {WEBHOOK_EVENTS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEvents.includes(value)}
                      onChange={(e) => setNewEvents((prev) =>
                        e.target.checked ? [...prev, value] : prev.filter((x) => x !== value)
                      )}
                      className="rounded"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              disabled={!newUrl.trim() || newEvents.length === 0 || creating}
              className="btn-primary text-sm"
              onClick={async () => {
                setCreating(true);
                try {
                  const wh = await api.webhooks.create(activeProduct.id, { url: newUrl, events: newEvents });
                  setRevealedSecret(wh.secret!);
                  setNewUrl(''); setNewEvents([]);
                  await load();
                  showToast('Webhook created', 'success');
                } catch (err) { showToast((err as Error).message, 'error'); }
                finally { setCreating(false); }
              }}
            >{creating ? '…' : 'Add webhook'}</button>
          </div>
        </div>

        {/* Secret is surfaced once after creation; the state is cleared when the user dismisses it */}
        {revealedSecret && (
          <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#10b981' }}>Save this secret - it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {revealedSecret}
              </code>
              <button
                className="btn-secondary text-xs flex-shrink-0"
                onClick={() => { navigator.clipboard.writeText(revealedSecret); showToast('Copied!', 'success'); }}
              >Copy</button>
              <button className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }} onClick={() => setRevealedSecret(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {/* Webhook list */}
        {webhooks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>No webhooks configured.</p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => (
              <div key={wh.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'var(--surface-2)' }}>
                  <span className="text-base flex-shrink-0">{wh.active ? '✅' : '⏸️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{wh.url}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {wh.events.length} event{wh.events.length !== 1 ? 's' : ''} · Created {new Date(wh.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ color: wh.active ? 'var(--text-3)' : 'var(--brand)', border: '1px solid var(--border)', background: 'transparent' }}
                      onClick={async () => {
                        try {
                          await api.webhooks.update(activeProduct.id, wh.id, { active: !wh.active });
                          await load();
                        } catch (err) { showToast((err as Error).message, 'error'); }
                      }}
                    >{wh.active ? 'Disable' : 'Enable'}</button>
                    <button
                      className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent' }}
                      onClick={async () => {
                        if (!await confirm('Delete this webhook?')) return;
                        try { await api.webhooks.delete(activeProduct.id, wh.id); await load(); showToast('Deleted', 'success'); }
                        catch (err) { showToast((err as Error).message, 'error'); }
                      }}
                    >Delete</button>
                  </div>
                </div>
                <div className="px-4 py-2 flex flex-wrap gap-1.5" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                  {wh.events.map((ev) => (
                    <span key={ev} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                      {ev}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Verification hint */}
        <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Verifying webhook signatures</p>
          <code className="block text-xs px-3 py-2 rounded-lg whitespace-pre" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>{`const sig = req.headers['x-planly-signature'];
const expected = 'sha256=' +
  crypto.createHmac('sha256', SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
if (sig !== expected) throw new Error('Bad signature');`}</code>
        </div>
      </div>
    </div>
  );
}
