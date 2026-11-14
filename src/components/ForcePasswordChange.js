'use client';

import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import { KeyRound, ShieldAlert, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * Blocking modal for students who must change their default password
 * after first login or a warden password reset.
 */
export default function ForcePasswordChange() {
  const { data: session, status } = useSession();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (status !== 'authenticated') return null;
  if (session?.user?.role !== 'STUDENT') return null;
  if (!session?.user?.needsPasswordChange) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.trim().length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/student/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to update password.');
        return;
      }

      toast.success('Password updated. Sign in again to continue.');
      setNewPassword('');
      setConfirmPassword('');
      await signOut({ callbackUrl: '/login' });
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal-dark/90 backdrop-blur-md p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-border bg-slate-card shadow-2xl p-6 sm:p-8 space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="force-pw-title"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-glow/10 text-amber-glow ring-1 ring-amber-glow/30">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h2 id="force-pw-title" className="text-xl font-bold text-white">
              Change Your Password
            </h2>
            <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">
              For security, you must set a new password before using MessMesh.
              This is required on first login or after a password reset.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              New Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <KeyRound className="h-4 w-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 10 characters"
                className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-3 pl-10 pr-11 text-sm text-white outline-none focus:border-emerald-primary focus:ring-2 focus:ring-emerald-primary/20"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-white"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full rounded-xl border border-slate-800 bg-charcoal-dark py-3 px-4 text-sm text-white outline-none focus:border-emerald-primary focus:ring-2 focus:ring-emerald-primary/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-primary hover:bg-emerald-primary/90 disabled:opacity-50 py-3 text-sm font-bold text-slate-950 transition-all active:scale-[0.98]"
          >
            {submitting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              'Set New Password & Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
