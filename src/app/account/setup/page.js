'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountSetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/setup-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: new URLSearchParams(window.location.search).get('token'),
          password,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || 'Unable to use this setup link.');
        return;
      }
      setMessage(result.message);
      setPassword('');
      setTimeout(() => router.push('/login'), 1500);
    } catch {
      setMessage('Unable to complete account setup. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-charcoal-dark px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-slate-border bg-slate-card p-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Set up your MessMesh account</h1>
          <p className="mt-2 text-sm text-slate-400">Choose a password with at least 10 characters. Setup links can only be used once.</p>
        </div>
        <label className="block text-sm text-slate-300">
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-charcoal-dark px-4 py-3 text-white"
          />
        </label>
        {message && <p role="status" className="text-sm text-slate-300">{message}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-emerald-primary px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </main>
  );
}
