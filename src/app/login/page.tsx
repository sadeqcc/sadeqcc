'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/providers';
import { Card, Field, Segmented, Spinner, TextInput } from '@/components/ui';
import { LANGS, LANG_LABEL } from '@/i18n/dict';
import { ApiError, apiWrite } from '@/lib/client';

export default function LoginPage() {
  const { user, needsSetup, authReady, refreshAuth, toast, t, settings, setSettings } = useApp();
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
      toast(mode === 'setup' ? t('shop_created') : t('welcome_back'));
      router.replace('/');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network_error';
      setError(
        code === 'invalid_credentials'
          ? t('bad_credentials')
          : code === 'username_taken'
            ? t('username_in_use')
            : code === 'registration_closed'
              ? t('registration_closed')
              : code === 'validation_failed'
                ? t('credentials_invalid')
                : t('network_error'),
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
        <h1 className="text-[22px] font-extrabold tracking-[0.16em] text-gold">{t('app_name')}</h1>
        <p className="mt-1 text-[13px] text-muted">{t('app_tagline')}</p>
      </div>

      {/* The language is chosen before anyone signs in, so the first screen already reads right. */}
      <div className="mb-4">
        <Segmented
          value={settings.language}
          onChange={(v) => void setSettings({ language: v })}
          options={LANGS.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-3">
          <h2 className="text-[15px] font-bold text-ink">{mode === 'setup' ? t('create_shop_account') : t('sign_in')}</h2>

          {mode === 'setup' ? (
            <Field label={t('your_name')}>
              <TextInput value={displayName} onChange={setDisplayName} />
            </Field>
          ) : null}

          <Field label={t('username')} required>
            <TextInput value={username} onChange={setUsername} autoFocus />
          </Field>

          <Field label={t('password')} required>
            <TextInput value={password} onChange={setPassword} type="password" placeholder="••••••••" />
          </Field>

          {error ? <p className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] font-semibold text-bad">{error}</p> : null}

          <button type="submit" className="btn-primary w-full" disabled={busy || !username || !password}>
            {busy ? <Spinner /> : null}
            {mode === 'setup' ? t('create_shop') : t('sign_in')}
          </button>

          {!needsSetup ? (
            <p className="text-center text-[12px] text-muted">
              {t('staff_note')}
            </p>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
