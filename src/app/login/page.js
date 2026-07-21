'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, AlertCircle, ChefHat, ShieldAlert } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleQuickLogin = async (selectedEmail, selectedPassword) => {
    setError('');
    setLoading(true);
    try {
      const res = await signIn('credentials', {
        email: selectedEmail,
        password: selectedPassword,
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

  // Seeded demo accounts (dev quick-login only)
  const quickAccounts = [
    { name: 'Warden Susan', email: 'warden1@messmesh.com', pass: 'warden123', role: 'WARDEN', wing: 'A-Wing' },
    { name: 'Warden Thomas', email: 'warden2@messmesh.com', pass: 'warden123', role: 'WARDEN', wing: 'B-Wing' },
    { name: 'Warden Michael', email: 'warden3@messmesh.com', pass: 'warden123', role: 'WARDEN', wing: 'C-Wing' },
    { name: 'Warden Sarah', email: 'warden4@messmesh.com', pass: 'warden123', role: 'WARDEN', wing: 'D-Wing' },
    { name: 'Alice Smith', email: 'student1@messmesh.com', pass: 'student123', role: 'STUDENT', wing: 'A-Wing' },
    { name: 'Charlie Brown', email: 'student3@messmesh.com', pass: 'student123', role: 'STUDENT', wing: 'C-Wing' },
  ];

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

          {/* Dev-only quick login; omitted from production builds */}
          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-8 border-t border-slate-border/80 pt-6 space-y-4">
              <div className="flex items-center gap-2 text-slate-400">
                <ShieldAlert className="h-4 w-4 text-terracotta" />
                <h4 className="text-xs font-semibold uppercase tracking-wider">
                  Developer Tool: Single-Tap Login Simulator
                </h4>
              </div>

              <p className="text-[11px] text-slate-500 leading-normal">
                Click any of the pre-seeded account blocks below to bypass credentials
                input. Hidden automatically in production builds.
              </p>

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {quickAccounts.map((acc) => (
                  <div
                    key={acc.email}
                    onClick={() => handleQuickLogin(acc.email, acc.pass)}
                    className="cursor-pointer rounded-xl border border-slate-800/80 bg-charcoal-dark hover:border-emerald-primary/30 p-3 hover:bg-slate-card transition-all flex flex-col justify-between group active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white group-hover:text-emerald-primary transition-colors">
                        {acc.name}
                      </span>
                      <span
                        className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                          acc.role === 'WARDEN'
                            ? 'bg-terracotta/10 border-terracotta/20 text-terracotta'
                            : 'bg-emerald-primary/10 border-emerald-primary/20 text-emerald-primary'
                        }`}
                      >
                        {acc.role}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-3 text-[10px] text-slate-500">
                      <span>{acc.email}</span>
                      <span className="font-medium text-slate-600 group-hover:text-slate-400 transition-colors">
                        {acc.wing}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
