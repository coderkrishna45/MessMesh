'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

const WINGS = ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];

export default function ManageWardensPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [wardens, setWardens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', wing: WINGS[0] });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadWardens = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/wardens');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load wardens.');
      setWardens(data.wardens || []);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated') {
      if (session.user.role !== 'ADMIN') router.replace('/dashboard');
      else loadWardens();
    }
  }, [status, session, router, loadWardens]);

  async function mutate(payload) {
    setSaving(true);
    setError('');
    setPreview(null);
    try {
      const response = await fetch('/api/admin/wardens', {
        method: payload.action === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          payload.action === 'create'
            ? { name: form.name, email: form.email, wing: form.wing }
            : payload
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update warden.');
      if (data.invitation?.status === 'preview') setPreview(data.invitation.setupUrl);
      if (data.invitation?.status === 'not_configured') {
        setError('Account saved, but no email was sent. Configure MAIL_DELIVERY_URL and MAIL_DELIVERY_TOKEN, then issue a new setup link.');
      }
      if (data.invitation?.status === 'failed') {
        setError(data.message || 'Invitation delivery failed; no email delivery was confirmed.');
      }
      if (payload.action === 'create') setForm({ name: '', email: '', wing: WINGS[0] });
      await loadWardens();
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setSaving(false);
    }
  }

  if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-charcoal-dark text-white">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-primary">Administration</p>
          <h1 className="mt-2 text-3xl font-bold">Warden accounts</h1>
          <p className="mt-2 text-sm text-slate-400">Create accounts, assign wings, and manage access. Changes invalidate existing sessions.</p>
        </header>

        {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}
        {preview && (
          <section className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="font-semibold text-amber-200">Invitation preview — no email was sent</p>
            <a className="mt-2 block break-all text-sm text-amber-100 underline" href={preview}>{preview}</a>
            {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && <p className="mt-2 text-xs text-amber-200">Fictional demo account invitation.</p>}
          </section>
        )}

        <section className="rounded-2xl border border-slate-border bg-slate-card/50 p-5">
          <h2 className="text-lg font-bold">Create warden</h2>
          <form
            className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              mutate({ action: 'create' });
            }}
          >
            <input required placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-lg border border-slate-700 bg-charcoal-dark px-3 py-2 text-sm" />
            <input required type="email" placeholder="Email address" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-lg border border-slate-700 bg-charcoal-dark px-3 py-2 text-sm" />
            <select value={form.wing} onChange={(event) => setForm({ ...form, wing: event.target.value })} className="rounded-lg border border-slate-700 bg-charcoal-dark px-3 py-2 text-sm">
              {WINGS.map((wing) => <option key={wing}>{wing}</option>)}
            </select>
            <button disabled={saving} className="rounded-lg bg-emerald-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">Create & invite</button>
          </form>
        </section>

        <section className="overflow-x-auto rounded-2xl border border-slate-border bg-slate-card/50">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-border text-xs uppercase text-slate-400">
              <tr><th className="p-4">Warden</th><th className="p-4">Email</th><th className="p-4">Wing</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-border/60">
              {loading ? <tr><td className="p-4 text-slate-400" colSpan={5}>Loading wardens…</td></tr> :
                wardens.map((warden) => (
                  <WardenRow key={warden.id} warden={warden} busy={saving} onMutate={mutate} />
                ))}
              {!loading && wardens.length === 0 && <tr><td className="p-4 text-slate-400" colSpan={5}>No warden accounts yet.</td></tr>}
            </tbody>
          </table>
        </section>
        <p className="text-xs text-slate-500">Setup links expire after 24 hours and work once. Delivery status is shown explicitly; preview links are available only in development/demo environments.</p>
      </main>
    </div>
  );
}

function WardenRow({ warden, busy, onMutate }) {
  const [wing, setWing] = useState(warden.wing);
  return (
    <tr>
      <td className="p-4 font-medium">{warden.name}{warden.isDemoAccount && <span className="ml-2 text-xs text-amber-300">Demo entry</span>}</td>
      <td className="p-4 text-slate-300">{warden.email}</td>
      <td className="p-4">
        <select disabled={busy || warden.isDemoAccount} value={wing} onChange={(event) => setWing(event.target.value)} className="rounded border border-slate-700 bg-charcoal-dark px-2 py-1">
          {WINGS.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button disabled={busy || warden.isDemoAccount || wing === warden.wing} onClick={() => onMutate({ action: 'change-wing', wardenId: warden.id, wing })} className="ml-2 text-xs text-emerald-primary disabled:opacity-40">Save</button>
      </td>
      <td className="p-4">{warden.active === false ? 'Inactive' : 'Active'}</td>
      <td className="p-4">
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || warden.isDemoAccount} onClick={() => onMutate({ action: warden.active === false ? 'activate' : 'deactivate', wardenId: warden.id })} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40">{warden.active === false ? 'Reactivate' : 'Deactivate'}</button>
          <button disabled={busy || warden.isDemoAccount} onClick={() => onMutate({ action: 'issue-setup', wardenId: warden.id })} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40">Issue setup/reset</button>
        </div>
      </td>
    </tr>
  );
}
