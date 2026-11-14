'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, AlertCircle, ChefHat, ShieldAlert } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/demo/status')
      .then((response) => response.json())
      .then((data) => setDemoEnabled(data.enabled === true))
      .catch(() => setDemoEnabled(false));
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError(res.error || 'Authentication failed. Please try again.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoRole) => {
    setError('');
    setLoading(true);
    try {
      const res = await signIn('credentials', {
        demoRole,
        redirect: false,
      });

      if (res?.error) {
        setError(res.error || 'Authentication failed. Please try again.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-charcoal-dark px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl space-y-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-primary/10 text-emerald-primary ring-1 ring-emerald-primary/30">
            <ChefHat className="h-7 w-7" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-white">
            Welcome to <span className="bg-gradient-to-r from-emerald-primary to-emerald-primary/80 bg-clip-text text-transparent">MessMesh</span>
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Smart, democratic mess management & waste logging
          </p>
        </div>

        <div className="rounded-2xl border border-slate-border bg-slate-card/50 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email or Roll Number
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="name@messmesh.com or CS2023001"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-slate-800 bg-charcoal-dark py-3 pl-10 pr-4 text-white placeholder-slate-500 outline-none ring-offset-slate-950 transition-all focus:border-emerald-primary focus:ring-2 focus:ring-emerald-primary/20 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <KeyRound className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-800 bg-charcoal-dark py-3 pl-10 pr-4 text-white placeholder-slate-500 outline-none ring-offset-slate-950 transition-all focus:border-emerald-primary focus:ring-2 focus:ring-emerald-primary/20 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-primary to-emerald-primary/80 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-primary/10 transition-all hover:opacity-95 hover:shadow-emerald-primary/20 focus:outline-none focus:ring-2 focus:ring-emerald-primary focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 text-sm"
            >
              {loading ? 'Logging in...' : 'Sign In'}
            </button>
          </form>

          {demoEnabled && (
            <div className="mt-8 border-t border-slate-border/80 pt-6 space-y-4">
              <div className="flex items-center gap-2 text-slate-400">
                <ShieldAlert className="h-4 w-4 text-terracotta" />
                <h4 className="text-xs font-semibold uppercase tracking-wider">
                  Public portfolio demo
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Explore the isolated demo using fictional accounts and sample activity.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['ADMIN', 'Explore as Admin'],
                  ['WARDEN', 'Explore as Warden'],
                  ['STUDENT', 'Explore as Student'],
                ].map(([role, label]) => (
                  <button
                    key={role}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin(role)}
                    className="rounded-xl border border-slate-800/80 bg-charcoal-dark px-3 py-3 text-xs font-bold text-white transition-colors hover:border-emerald-primary/40 hover:text-emerald-primary disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
