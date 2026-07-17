'use client';

import { Award } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-border/40 bg-charcoal-dark/50 py-8 mt-16 text-center text-xs text-slate-500">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-1.5 opacity-60">
          <Award className="h-4 w-4 text-emerald-primary" />
          <span className="font-bold text-slate-400">MessMesh Smart Hostel Mess Management</span>
        </div>
        <span className="font-medium">
          Made with ♥ by <strong className="text-slate-400 font-bold">MessIntel Team</strong> — 2026
        </span>
      </div>
    </footer>
  );
}
