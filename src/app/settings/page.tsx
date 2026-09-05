'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, KeyRound, Languages, Palette, Store, Upload, Users } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Card, CardTitle, Field, NumberInput, Segmented, Select, Spinner, TextInput, Toggle } from '@/components/ui';
import { ApiError, apiGet, apiWrite, download } from '@/lib/client';
import { formatMoney, formatWeight, parseMoney, parseWeight } from '@/lib/num';
import { diffDays, dubaiDate, dubaiShort } from '@/lib/date';
import { LANGS, LANG_LABEL } from '@/i18n/dict';

interface StaffUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  status: string;
}

export default function SettingsPage() {
  const { settings, setSettings, user, refreshAuth, toast, confirm, can, t } = useApp();
  const [shopName, setShopName] = useState(settings.shopName);
  const [shopPhone, setShopPhone] = useState(settings.shopPhone);
  const [shopAddress, setShopAddress] = useState(settings.shopAddress);
  const [currency, setCurrency] = useState(settings.currency);
  const [prefix, setPrefix] = useState(settings.orderNumberPrefix);
  const [padding, setPadding] = useState(String(settings.orderNumberPadding));
  const [tolerance, setTolerance] = useState(formatWeight(settings.defaultToleranceMg, false));
  const [making, setMaking] = useState(formatMoney(settings.defaultMakingChargeFilsPerGram, false));
  const [vat, setVat] = useState(String(settings.vatPercent));
  const [lists, setLists] = useState({
    karats: settings.karats.join(', '),
    styles: settings.styles.join(', '),
    categories: settings.categories.join(', '),
    paymentMethods: settings.paymentMethods.join(', '),
    destinations: settings.destinations.join(', '),
  });
  const [saving, setSaving] = useState(false);

  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [newStaff, setNewStaff] = useState({ username: '', password: '', displayName: '', role: 'employee' });
  const restoreRef = useRef<HTMLInputElement>(null);
  // Days since the last backup, so the reminder can nag when it should.
  const backupAgeDays = settings.lastBackupAt ? diffDays(dubaiDate(), settings.lastBackupAt.slice(0, 10)) : null;
  const markBackupTaken = () => {
    void setSettings({ lastBackupAt: new Date().toISOString() });
    toast(t('backup_taken'));
  };
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    setShopName(settings.shopName);
    setShopPhone(settings.shopPhone);
    setShopAddress(settings.shopAddress);
    setCurrency(settings.currency);
    setPrefix(settings.orderNumberPrefix);
    setPadding(String(settings.orderNumberPadding));
    setTolerance(formatWeight(settings.defaultToleranceMg, false));
    setMaking(formatMoney(settings.defaultMakingChargeFilsPerGram, false));
    setVat(String(settings.vatPercent));
    setLists({
      karats: settings.karats.join(', '),
      styles: settings.styles.join(', '),
      categories: settings.categories.join(', '),
      paymentMethods: settings.paymentMethods.join(', '),
      destinations: settings.destinations.join(', '),
    });
  }, [settings]);

  const loadStaff = useCallback(async () => {
    if (!can('user.manage')) return;
    try {
      const d = await apiGet<{ users: StaffUser[] }>('/api/users');
      setStaff(d.users);
    } catch {
      /* the owner may be offline */
    }
  }, [can]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const saveShop = async () => {
    setSaving(true);
    try {
      await setSettings({
        shopName,
        shopPhone,
        shopAddress,
        currency: currency.slice(0, 6) || 'AED',
        orderNumberPrefix: prefix.slice(0, 8) || 'GO',
        orderNumberPadding: Math.min(Math.max(Number(padding) || 4, 1), 8),
        defaultToleranceMg: parseWeight(tolerance) ?? 0,
        defaultMakingChargeFilsPerGram: parseMoney(making) ?? 0,
        vatPercent: Number(vat) || 0,
        karats: splitList(lists.karats),
        styles: splitList(lists.styles),
        categories: splitList(lists.categories),
        paymentMethods: splitList(lists.paymentMethods),
        destinations: splitList(lists.destinations),
      });
      toast(t('settings_saved'));
    } catch {
      toast(t('could_not_save_settings'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePin = async () => {
    try {
      await apiWrite('/api/auth/pin', { pin: pin || null, currentPin }, 'POST', { queue: false });
      await refreshAuth();
      setPin('');
      setCurrentPin('');
      toast(pin ? t('pin_updated') : t('pin_removed'));
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'wrong_pin' ? t('wrong_current_pin') : t('could_not_update_pin'), 'error');
    }
  };

  const addStaff = async () => {
    if (newStaff.username.length < 3 || newStaff.password.length < 6) {
      toast(t('credentials_rule'), 'error');
      return;
    }
    try {
      await apiWrite('/api/users', newStaff, 'POST', { queue: false });
      setNewStaff({ username: '', password: '', displayName: '', role: 'employee' });
      await loadStaff();
      toast(t('staff_created'));
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'username_taken' ? t('username_taken') : t('could_not_create_account'), 'error');
    }
  };

  const restore = async (file: File) => {
    const c = await confirm({
      title: t('restore_title'),
      body: t('restore_body'),
      danger: true,
      confirmLabel: t('restore_ok'),
      requirePin: true,
    });
    if (!c.ok) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as unknown;
      const res = await apiWrite<{ counts: Record<string, number> }>('/api/backup/restore', { backup, pin: c.pin }, 'POST', { queue: false });
      toast(t('restored_n', { n: Object.values(res?.counts ?? {}).reduce((a, b) => a + b, 0) }));
      window.location.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'invalid_backup';
      toast(
        code === 'wrong_pin'
          ? t('restore_pin_wrong')
          : code === 'unknown_table' || code === 'unknown_column' || code === 'invalid_backup'
            ? t('restore_invalid')
            : t('could_not_restore'),
        'error',
      );
    } finally {
      setRestoring(false);
      if (restoreRef.current) restoreRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold text-ink">{t('settings')}</h2>

      {/* Language sits first: it is what every other label on this page depends on. */}
      <Card>
        <CardTitle title={t('language')} subtitle={t('language_hint')} icon={<Languages className="h-4 w-4" />} />
        <Segmented
          value={settings.language}
          onChange={(v) => void setSettings({ language: v })}
          options={LANGS.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
      </Card>

      <Card>
        <CardTitle title={t('appearance')} icon={<Palette className="h-4 w-4" />} />
        <Segmented
          value={settings.theme}
          onChange={(v) => void setSettings({ theme: v })}
          options={[
            { value: 'dark', label: t('theme_dark') },
            { value: 'light', label: t('theme_light') },
            { value: 'system', label: t('theme_system') },
          ]}
        />
        <p className="mt-2 text-[12px] text-muted">{t('theme_hint')}</p>
      </Card>

      {can('settings.manage') ? (
        <>
          <Card>
            <CardTitle title={t('shop')} icon={<Store className="h-4 w-4" />} />
            <div className="space-y-3">
              <Field label={t('shop_name')}>
                <TextInput value={shopName} onChange={setShopName} />
              </Field>
              <Field label={t('shop_phone')}>
                <TextInput value={shopPhone} onChange={setShopPhone} inputMode="tel" />
              </Field>
              <Field label={t('shop_address')}>
                <TextInput value={shopAddress} onChange={setShopAddress} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('currency')}>
                  <TextInput value={currency} onChange={setCurrency} />
                </Field>
                <Field label={t('timezone')} hint={t('timezone_hint')}>
                  <TextInput value={settings.timezone} onChange={() => undefined} disabled />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle title={t('order_defaults')} />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('number_prefix')} hint={t('number_prefix_hint', { example: `${prefix || 'GO'}-${dubaiDate().slice(0, 4)}-0001` })}>
                  <TextInput value={prefix} onChange={setPrefix} />
                </Field>
                <Field label={t('number_padding')}>
                  <NumberInput value={padding} onChange={setPadding} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('default_tolerance')}>
                  <NumberInput value={tolerance} onChange={setTolerance} suffix="g" />
                </Field>
                <Field label={t('default_making')}>
                  <NumberInput value={making} onChange={setMaking} suffix={`${currency}/g`} />
                </Field>
              </div>
              <Field label={t('default_vat')}>
                <NumberInput value={vat} onChange={setVat} suffix="%" />
              </Field>
              <Field label={t('weight_precision')} hint={t('weight_precision_hint')}>
                <Select
                  value={String(settings.weightPrecision)}
                  onChange={(v) => void setSettings({ weightPrecision: Number(v) as 1 | 2 | 3 })}
                  options={[
                    { value: '3', label: '0.001 g' },
                    { value: '2', label: '0.010 g' },
                    { value: '1', label: '0.100 g' },
                  ]}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle title={t('lists')} subtitle={t('lists_hint')} />
            <div className="space-y-3">
              <Field label={t('karats')}>
                <TextInput value={lists.karats} onChange={(v) => setLists((l) => ({ ...l, karats: v }))} />
              </Field>
              <Field label={t('styles')}>
                <TextInput value={lists.styles} onChange={(v) => setLists((l) => ({ ...l, styles: v }))} />
              </Field>
              <Field label={t('categories')}>
                <TextInput value={lists.categories} onChange={(v) => setLists((l) => ({ ...l, categories: v }))} />
              </Field>
              <Field label={t('payment_methods')}>
                <TextInput value={lists.paymentMethods} onChange={(v) => setLists((l) => ({ ...l, paymentMethods: v }))} />
              </Field>
              <Field label={t('destinations')}>
                <TextInput value={lists.destinations} onChange={(v) => setLists((l) => ({ ...l, destinations: v }))} />
              </Field>
            </div>
          </Card>

          <button type="button" className="btn-primary w-full" onClick={() => void saveShop()} disabled={saving}>
            {saving ? <Spinner /> : null}
            {t('save_settings')}
          </button>
        </>
      ) : null}

      <Card>
        <CardTitle title={t('security_pin')} subtitle={t('security_pin_hint')} icon={<KeyRound className="h-4 w-4" />} />
        <div className="space-y-3">
          {user?.hasPin ? (
            <Field label={t('current_pin')}>
              <input className="input num" type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} />
            </Field>
          ) : null}
          <Field label={t('new_pin')} hint={t('new_pin_hint')}>
            <input className="input num" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          </Field>
          <button type="button" className="btn-ghost w-full" onClick={() => void savePin()}>
            {user?.hasPin ? t('update_pin') : t('set_pin')}
          </button>
        </div>
      </Card>

      {can('user.manage') ? (
        <Card>
          <CardTitle title={t('staff')} subtitle={t('staff_hint')} icon={<Users className="h-4 w-4" />} />
          {staff.length ? (
            <ul className="mb-3 divide-y divide-line/70">
              {staff.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{s.displayName ?? s.username}</span>
                    <span className="block text-[12px] capitalize text-muted">
                      {s.username} · {s.role} · {s.status}
                    </span>
                  </span>
                  {s.role !== 'owner' ? (
                    <Toggle
                      checked={s.status === 'active'}
                      label={`${s.username} active`}
                      onChange={async (v) => {
                        await apiWrite(`/api/users/${s.id}`, { status: v ? 'active' : 'suspended' }, 'PATCH', { queue: false });
                        await loadStaff();
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <TextInput value={newStaff.username} onChange={(v) => setNewStaff((s) => ({ ...s, username: v }))} placeholder={t('staff_username')} ariaLabel={t('staff_username')} />
              <TextInput value={newStaff.password} onChange={(v) => setNewStaff((s) => ({ ...s, password: v }))} type="password" placeholder={t('staff_password')} ariaLabel={t('staff_password')} />
            </div>
            <TextInput value={newStaff.displayName} onChange={(v) => setNewStaff((s) => ({ ...s, displayName: v }))} placeholder={t('staff_display_name')} ariaLabel={t('staff_display_name')} />
            <Select
              value={newStaff.role}
              onChange={(v) => setNewStaff((s) => ({ ...s, role: v }))}
              ariaLabel={t('staff')}
              options={[
                { value: 'employee', label: t('role_employee') },
                { value: 'manager', label: t('role_manager') },
              ]}
            />
            <button type="button" className="btn-ghost w-full" onClick={() => void addStaff()}>
              {t('add_staff')}
            </button>
          </div>
        </Card>
      ) : null}

      {can('backup.manage') ? (
        <Card>
          <CardTitle title={t('backup')} subtitle={t('backup_hint')} icon={<Database className="h-4 w-4" />} />

          {/* A backup only helps if it is recent, so the app keeps score. */}
          <div
            className={`mb-3 rounded-xl border px-3 py-2.5 text-[13px] ${
              backupAgeDays === null || backupAgeDays >= 7
                ? 'border-warn/40 bg-warn/10 text-warn'
                : 'border-ok/40 bg-ok/10 text-ok'
            }`}
          >
            <p className="font-bold">
              {settings.lastBackupAt === null || backupAgeDays === null
                ? t('backup_never')
                : backupAgeDays <= 0
                  ? t('backup_ok')
                  : backupAgeDays >= 7
                    ? t('backup_due', { n: backupAgeDays })
                    : t('backup_last', { when: dubaiShort(settings.lastBackupAt.slice(0, 10)) })}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{t('backup_reminder')}</p>
          </div>

          <div className="space-y-2">
            <a href="/api/backup/export" className="btn-primary w-full" onClick={markBackupTaken}>
              <Download className="h-4 w-4" /> {t('take_backup')}
            </a>
            <a href="/api/backup/export?media=0" className="btn-ghost w-full" onClick={markBackupTaken}>
              <Download className="h-4 w-4" /> {t('download_backup_light')}
            </a>
            <button type="button" className="btn-ghost w-full" onClick={() => restoreRef.current?.click()} disabled={restoring}>
              {restoring ? <Spinner /> : <Upload className="h-4 w-4" />}
              {t('restore_backup')}
            </button>
            <input
              ref={restoreRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
              }}
            />
            <p className="text-[11px] text-muted">
              {t('restore_note')}
            </p>
          </div>
        </Card>
      ) : null}

      {can('audit.view') ? (
        <Card>
          <CardTitle title={t('audit_log')} subtitle={t('audit_log_hint')} />
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={async () => {
              try {
                const d = await apiGet<{ entries: unknown[] }>('/api/audit?limit=1000');
                download(`gold-orders-audit-${dubaiDate()}.json`, JSON.stringify(d.entries, null, 2));
              } catch {
                toast(t('could_not_download_audit'), 'error');
              }
            }}
          >
            <Download className="h-4 w-4" /> {t('download_audit')}
          </button>
        </Card>
      ) : null}

      <p className="pb-2 text-center text-[11px] text-muted">
        {t('settings_footer')}
      </p>
    </div>
  );
}
