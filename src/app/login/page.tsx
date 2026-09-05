'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/providers';
import { Card, Field, Spinner, TextInput } from '@/components/ui';
import { ApiError, apiWrite } from '@/lib/client';

export default function LoginPage() {
  const { user, needsSetup, authReady, refreshAuth, toast } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (needsSetup) setMode('setup');
  }, [needsSetup]);

  useEffect(() => {
    if (authReady && user) router.replace('/');
  }, [authReady, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path = mode === 'setup' ? '/api/auth/register' : '/api/auth/login';
      await apiWrite(path, { username, password, displayName: displayName || username }, 'POST', { queue: false });
      await refreshAuth();
      toast(mode === 'setup' ? 'Shop created' : 'Welcome back');
      router.replace('/');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network_error';
      setError(
        code === 'invalid_credentials'
          ? 'That username and password do not match.'
          : code === 'username_taken'
            ? 'That username is already in use.'
            : code === 'registration_closed'
              ? 'This shop already has an owner. Sign in instead.'
              : code === 'validation_failed'
                ? 'Username needs 3+ characters and the password 6+.'
                : 'Could not reach the server. Check your connection.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[80dvh] flex-col justify-center">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-2xl" aria-hidden>
          🥇
        </span>
        <h1 className="text-[22px] font-extrabold tracking-[0.16em] text-gold">GOLD ORDERS</h1>
        <p className="mt-1 text-[13px] text-muted">Gold Order Tracking &amp; Delivery Management</p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-3">
          <h2 className="text-[15px] font-bold text-ink">{mode === 'setup' ? 'Create your shop account' : 'Sign in'}</h2>

          {mode === 'setup' ? (
            <Field label="Your name">
              <TextInput value={displayName} onChange={setDisplayName} placeholder="Shop owner" />
            </Field>
          ) : null}

          <Field label="Username" required>
            <TextInput value={username} onChange={setUsername} placeholder="owner" autoFocus />
          </Field>

          <Field label="Password" required>
            <TextInput value={password} onChange={setPassword} type="password" placeholder="••••••••" />
          </Field>

          {error ? <p className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] font-semibold text-bad">{error}</p> : null}

          <button type="submit" className="btn-primary w-full" disabled={busy || !username || !password}>
            {busy ? <Spinner /> : null}
            {mode === 'setup' ? 'Create shop' : 'Sign in'}
          </button>

          {!needsSetup ? (
            <p className="text-center text-[12px] text-muted">
              Staff accounts are created by the owner in Settings.
            </p>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
