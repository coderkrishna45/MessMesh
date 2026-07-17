'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import ForcePasswordChange from '@/components/ForcePasswordChange';

export function Providers({ children }) {
  return (
    <SessionProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#16181b',
            color: '#fff',
            border: '1px solid #282a2d',
            fontSize: '13px',
            borderRadius: '12px',
            maxWidth: '350px',
            padding: '12px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#16181b',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#16181b',
            },
          },
        }}
      />
      <ForcePasswordChange />
      {children}
    </SessionProvider>
  );
}
