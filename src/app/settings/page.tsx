'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Download, KeyRound, LogOut, Palette, Plus, Trash2, Upload, Users } from 'lucide-react';
import { Card, CardTitle, EmptyState, Field, NumberInput, Select, Skeleton, TextInput, Toggle } from '@/components/ui';
import { useApp } from '@/components/providers';
import { apiGet, apiWrite, download, uuid } from '@/lib/client';
import { formatGold, parseGold, parseCash, formatCash } from '@/lib/num';
import { HOLDER_TYPES, type Person } from '@/lib/types';
import type { DictKey } from '@/i18n/dict';

export default function SettingsPage() {
  const { t, settings, setSettings, user, toast, confirm, refreshAuth } = useApp();
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [newPerson, setNewPerson] = useState({ name: '', type: 'person' });
  const [newKarat, setNewKarat] = useState('');
  const [pin, setPin] = useState({ current: '', next: '' });
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<{ rows: Person[] }>('/api/records/people')
      .then((r) => setPeople(r.rows))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const exportBackup = async () => {
    const data = await apiGet<unknown>('/api/backup/export');
    download(`sadeq-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    toast(t('saved'), 'ok');
  };

  const restoreBackup = async (file: File) => {
    let parsed: { format?: string; exportedAt?: string; data?: unknown };
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast(t('error_generic'), 'error');
      return;
    }
    if (!parsed.format?.startsWith('sadeq-drawer-backup') || !parsed.data) {
      toast(t('error_generic'), 'error');
      return;
    }
    const res = await confirm({
      title: t('restore_backup'),
      body: `${t('backup_date')}: ${parsed.exportedAt ?? '—'} · ${t('restore_warning')}`,
      confirmLabel: t('confirm'),
      requirePin: !!user?.hasPin,
    });
    if (!res.ok) return;
    try {
      await apiWrite('/api/backup/restore', { backup: parsed, confirm: true, mode: 'merge', pin: res.pin ?? null }, 'POST', { queue: false });
      toast(t('saved'), 'ok');
      router.refresh();
    } catch (e) {
      toast((e as Error).message === 'bad_pin' ? t('bad_pin') : t('error_generic'), 'error');
    }
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;

  return (
    <div className="space-y-3">
      <Card>
        <CardTitle title={t('settings_title')} icon={<Palette className="h-4 w-4" />} />
        <div className="space-y-3">
          <Field label={t('language')}>
            <Select
              value={settings.language}
              onChange={(v) => void setSettings({ language: v as 'ar' | 'en' })}
              options={[
                { value: 'ar', label: 'العربية' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Field>
          <Field label={t('theme')}>
            <Select
              value={settings.theme}
              onChange={(v) => void setSettings({ theme: v as 'dark' | 'light' })}
              options={[
                { value: 'dark', label: t('dark') },
                { value: 'light', label: t('light') },
              ]}
            />
          </Field>
          <Field label={t('palette')}>
            <Select
              value={settings.palette}
              onChange={(v) => void setSettings({ palette: v as typeof settings.palette })}
              options={[
                { value: 'black_gold', label: t('p_black_gold') },
                { value: 'navy_gold', label: t('p_navy_gold') },
                { value: 'white_gold', label: t('p_white_gold') },
                { value: 'emerald', label: t('p_emerald') },
                { value: 'burgundy', label: t('p_burgundy') },
                { value: 'high_contrast', label: t('p_high_contrast') },
              ]}
            />
          </Field>
          <Field label={t('shop_name')}>
            <TextInput value={settings.shopName} onChange={(v) => void setSettings({ shopName: v })} ariaLabel={t('shop_name')} />
          </Field>
          <Field label={t('employee_name')}>
            <TextInput value={settings.employeeName} onChange={(v) => void setSettings({ employeeName: v })} ariaLabel={t('employee_name')} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('currency')}>
              <TextInput value="AED" onChange={() => undefined} disabled ariaLabel={t('currency')} />
            </Field>
            <Field label={t('timezone')}>
              <TextInput value="Asia/Dubai" onChange={() => undefined} disabled ariaLabel={t('timezone')} />
            </Field>
          </div>
          <Field label={t('gold_precision')}>
            <Select
              value={String(settings.goldPrecision)}
              onChange={(v) => void setSettings({ goldPrecision: Number(v) as 1 | 10 | 100 })}
              options={[
                { value: '1', label: '0.001 g' },
                { value: '10', label: '0.010 g' },
                { value: '100', label: '0.100 g' },
              ]}
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">{t('tips_toggle')}</span>
            <Toggle checked={settings.tipsEnabled} onChange={(v) => void setSettings({ tipsEnabled: v })} label={t('tips_toggle')} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">{t('alerts_toggle')}</span>
            <Toggle checked={settings.alertsEnabled} onChange={(v) => void setSettings({ alertsEnabled: v })} label={t('alerts_toggle')} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">{t('multishift')}</span>
            <Toggle checked={settings.multiShift} onChange={(v) => void setSettings({ multiShift: v })} label={t('multishift')} />
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('karats_manage')} />
        <ul className="mb-2 space-y-1">
          {settings.karats.map((k) => (
            <li key={k} className="row">
              <span className="text-[13px] font-bold text-ink">{k}</span>
              <div className="flex items-center gap-2">
                <div className="w-28">
                  <NumberInput
                    value={settings.tolerances[k] ? formatGold(settings.tolerances[k], false) : ''}
                    ariaLabel={`${k} ${t('tolerance')}`}
                    onChange={(v) => {
                      const mg = parseGold(v) ?? 0;
                      void setSettings({ tolerances: { ...settings.tolerances, [k]: mg } });
                    }}
                  />
                </div>
                <button
                  className="rounded-lg p-2 text-muted hover:text-bad"
                  aria-label={t('delete')}
                  onClick={async () => {
                    const res = await confirm({ title: t('confirm_delete'), body: k, danger: true, confirmLabel: t('delete') });
                    if (!res.ok) return;
                    await setSettings({ karats: settings.karats.filter((x) => x !== k) });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mb-2 text-[11px] text-muted">{t('tolerance')} (g)</p>
        <div className="flex gap-2">
          <TextInput value={newKarat} onChange={setNewKarat} placeholder="24K" ariaLabel={t('add_karat')} />
          <button
            className="btn-ghost px-3"
            onClick={async () => {
              const k = newKarat.trim();
              if (!k || settings.karats.includes(k)) return;
              await setSettings({ karats: [...settings.karats, k] });
              setNewKarat('');
              toast(t('saved'), 'ok');
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">
          <Field label={`${t('cash_tolerance')} (AED)`}>
            <NumberInput
              value={settings.cashTolerance ? formatCash(settings.cashTolerance, false) : ''}
              ariaLabel={t('cash_tolerance')}
              onChange={(v) => void setSettings({ cashTolerance: parseCash(v) ?? 0 })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('people_manage')} icon={<Users className="h-4 w-4" />} />
        {people.length === 0 ? <EmptyState text={t('no_records')} /> : (
          <ul className="mb-3 space-y-1">
            {people.map((p) => (
              <li key={p.id} className="row">
                <span className="text-[13px] font-semibold text-ink">
                  {p.name} <span className="text-[11px] text-muted">· {t(`ht_${p.type}` as DictKey)}</span>
                </span>
                <button
                  className="rounded-lg p-2 text-muted hover:text-bad"
                  aria-label={t('delete')}
                  onClick={async () => {
                    const res = await confirm({ title: t('confirm_delete'), body: p.name, danger: true, confirmLabel: t('delete') });
                    if (!res.ok) return;
                    await apiWrite(`/api/records/people/${p.id}`, null, 'DELETE');
                    setPeople((list) => list.filter((x) => x.id !== p.id));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <TextInput value={newPerson.name} onChange={(v) => setNewPerson((p) => ({ ...p, name: v }))} placeholder={t('person_name')} ariaLabel={t('person_name')} />
          <Select
            value={newPerson.type}
            onChange={(v) => setNewPerson((p) => ({ ...p, type: v }))}
            options={HOLDER_TYPES.map((h) => ({ value: h, label: t(`ht_${h}` as DictKey) }))}
          />
          <button
            className="btn-ghost px-3"
            onClick={async () => {
              if (!newPerson.name.trim()) return;
              const id = uuid();
              await apiWrite('/api/records/people', { id, name: newPerson.name.trim(), type: newPerson.type });
              const r = await apiGet<{ rows: Person[] }>('/api/records/people');
              setPeople(r.rows);
              setNewPerson({ name: '', type: 'person' });
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('pin_section')} icon={<KeyRound className="h-4 w-4" />} />
        <div className="space-y-2">
          {user?.hasPin ? (
            <Field label={t('current_pin')}>
              <input className="input num" type="password" inputMode="numeric" value={pin.current} onChange={(e) => setPin((p) => ({ ...p, current: e.target.value }))} />
            </Field>
          ) : null}
          <Field label={t('new_pin')}>
            <input className="input num" type="password" inputMode="numeric" value={pin.next} onChange={(e) => setPin((p) => ({ ...p, next: e.target.value }))} />
          </Field>
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={async () => {
                try {
                  await apiWrite('/api/auth/pin', { pin: pin.next, currentPin: pin.current || null }, 'POST', { queue: false });
                  setPin({ current: '', next: '' });
                  await refreshAuth();
                  toast(t('saved'), 'ok');
                } catch (e) {
                  toast((e as Error).message === 'bad_pin' ? t('bad_pin') : t('error_generic'), 'error');
                }
              }}
            >
              {user?.hasPin ? t('change_pin') : t('set_pin')}
            </button>
            {user?.hasPin ? (
              <button
                className="btn-ghost"
                onClick={async () => {
                  try {
                    await apiWrite('/api/auth/pin', { pin: null, currentPin: pin.current || null }, 'POST', { queue: false });
                    setPin({ current: '', next: '' });
                    await refreshAuth();
                    toast(t('saved'), 'ok');
                  } catch {
                    toast(t('bad_pin'), 'error');
                  }
                }}
              >
                {t('remove_pin')}
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('backup')} icon={<Database className="h-4 w-4" />} />
        <div className="grid gap-2">
          <button className="btn-ghost" onClick={() => void exportBackup()}>
            <Download className="h-4 w-4" />
            {t('export_backup')}
          </button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {t('restore_backup')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restoreBackup(f);
              e.target.value = '';
            }}
          />
          <p className="text-[11px] text-muted">{t('restore_warning')}</p>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('account')} />
        <p className="mb-3 text-[13px] text-muted">{user?.displayName ?? user?.username ?? '—'}</p>
        <button
          className="btn-danger w-full"
          onClick={async () => {
            const res = await confirm({ title: t('logout'), confirmLabel: t('logout'), danger: true });
            if (!res.ok) return;
            await apiWrite('/api/auth/logout', {}, 'POST', { queue: false });
            router.replace('/login');
          }}
        >
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </button>
      </Card>
    </div>
  );
}
