import React from 'react';
import { LockKeyhole, Store } from 'lucide-react';

export type SignedInUser = { id: number; name: string; email: string; role: string };

export default function AuthScreen({ mode, onComplete, onModeChange }: {
  mode: 'setup' | 'login';
  onComplete: (user: SignedInUser) => void;
  onModeChange: (mode: 'setup' | 'login') => void;
}) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const setup = mode === 'setup';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(setup ? '/api/setup' : '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup ? { ownerName: name, email, password } : { email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not complete sign in.');
      onComplete(body.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Network error. Is the API running?'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><div className="brand-mark">B</div><div><b>BUVIMIMA</b><small>BUSINESS SUITE</small></div></div><div className="auth-icon"><Store size={22}/></div><h1>{setup ? 'Set up your company' : 'Welcome back'}</h1><p>{setup ? 'Create the owner account. We’ll set up the Main Shop, Branch, Corner Vista Restaurant, Kitchen, and Drinks units.' : 'Sign in to manage your business.'}</p>
    <form onSubmit={submit}>{setup && <label>Owner name<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name"/></label>}<label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"/></label><label>Password<input required type="password" autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} placeholder={setup ? 'At least 12 characters' : 'Your password'}/></label>
      {error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create owner account' : 'Sign in'} <LockKeyhole size={15}/></button></form>
      {!setup && <p className="auth-switch">First time here? <button onClick={() => onModeChange('setup')}>Set up the owner account</button></p>}
      <small className="auth-footnote">Company records are stored locally on this server. Keep your owner password safe.</small>
    </section></main>;
}
