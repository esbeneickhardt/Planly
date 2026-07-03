import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/kanban';
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '', realName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.users.create({ username: form.username, email: form.email, password: form.password, realName: form.realName || undefined });
      await login(form.email, form.password);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="block mx-auto w-12 h-12 rounded-2xl mb-4 overflow-hidden flex-shrink-0">
            <img src="/icons/icon.jpg" alt="Planly" className="w-full h-full object-cover" style={{ transform: 'scale(1.25)', transformOrigin: 'center' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Create account</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Start planning your project</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Full name</label>
            <input type="text" value={form.realName} onChange={set('realName')} className="input" placeholder="Alex Johnson" />
          </div>
          <div>
            <label className="label">Username</label>
            <input type="text" required value={form.username} onChange={set('username')} className="input" placeholder="alexj" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" required value={form.email} onChange={set('email')} className="input" placeholder="alex@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" required minLength={6} value={form.password} onChange={set('password')} className="input" placeholder="••••••••" />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input type="password" required minLength={6} value={form.confirmPassword} onChange={set('confirmPassword')} className="input" placeholder="••••••••" />
          </div>
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
            {loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--text-2)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--brand)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
