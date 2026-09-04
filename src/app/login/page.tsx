'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Card, Field, TextInput } from '@/components/ui';
import { useApp } from '@/components/providers';
import { apiGet, apiWrite } from '@/lib/client';

export default function LoginPage() {
  const { t, refreshAuth } = useApp();
  const router = useRouter();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ user: unknown; needsSetup: boolean }>('/api/auth/me')
      .then((m) => {
        if (m.user) router.replace('/');
        else setNeedsSetup(m.needsSetup);
      })
      .catch(() => setNeedsSetup(false));
  }, [router]);

  const submit = async () => {
    setError(null);
    if (username.trim().length < 3 || password.length < 6) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    try {
      await apiWrite(
        needsSetup ? '/api/auth/register' : '/api/auth/login',
        { username: username.trim(), password, displayName: displayName || undefined },
        'POST',
        { queue: false },
      );
      await refreshAuth();
      router.replace('/');
    } catch (e) {
      const code = (e as Error).message;
      setError(code === 'bad_credentials' ? t('bad_credentials') : code === 'rate_limited' ? t('error_generic') : t('error_generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70dvh] flex-col justify-center">
      <div className="mb-6 text-center">
        <p className="text-[34px]">🥇</p>
        <h1 className="text-[24px] font-extrabold tracking-wide text-gold">SADEQ DRAWER</h1>
        <p className="text-[13px] text-muted">Cash &amp; Gold Reconciliation</p>
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink">
          <ShieldCheck className="h-4 w-4 text-gold" />
          {needsSetup ? t('setup_owner') : t('login')}
        </h2>
        <div className="space-y-3">
          <Field label={t('username')} error={error}>
            <TextInput value={username} onChange={setUsername} autoFocus ariaLabel={t('username')} />
          </Field>
          <Field label={t('password')}>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </Field>
          {needsSetup ? (
            <Field label={t('display_name')}>
              <TextInput value={displayName} onChange={setDisplayName} ariaLabel={t('display_name')} />
            </Field>
          ) : null}
          <button className="btn-primary w-full" onClick={() => void submit()} disabled={busy || needsSetup === null}>
            <LogIn className="h-4 w-4" />
            {needsSetup ? t('setup_owner') : t('login')}
          </button>
        </div>
      </Card>
    </div>
  );
}
