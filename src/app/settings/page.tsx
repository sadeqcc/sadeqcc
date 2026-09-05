'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, KeyRound, Palette, Store, Upload, Users } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Card, CardTitle, Field, NumberInput, Segmented, Select, Spinner, TextInput, Toggle } from '@/components/ui';
import { ApiError, apiGet, apiWrite, download } from '@/lib/client';
import { formatMoney, formatWeight, parseMoney, parseWeight } from '@/lib/num';
import { dubaiDate } from '@/lib/date';

interface StaffUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  status: string;
}

export default function SettingsPage() {
  const { settings, setSettings, user, refreshAuth, toast, confirm, can } = useApp();
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
      toast('Settings saved');
    } catch {
      toast('Could not save the settings', 'error');
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
      toast(pin ? 'PIN updated' : 'PIN removed');
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'wrong_pin' ? 'Current PIN is wrong' : 'Could not update the PIN', 'error');
    }
  };

  const addStaff = async () => {
    if (newStaff.username.length < 3 || newStaff.password.length < 6) {
      toast('Username needs 3+ characters and the password 6+', 'error');
      return;
    }
    try {
      await apiWrite('/api/users', newStaff, 'POST', { queue: false });
      setNewStaff({ username: '', password: '', displayName: '', role: 'employee' });
      await loadStaff();
      toast('Staff account created');
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'username_taken' ? 'That username is taken' : 'Could not create the account', 'error');
    }
  };

  const restore = async (file: File) => {
    const c = await confirm({
      title: 'Restore this backup?',
      body: 'The file is validated first. Nothing is deleted unless the whole backup checks out.',
      danger: true,
      confirmLabel: 'Validate and restore',
      requirePin: true,
    });
    if (!c.ok) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as unknown;
      const res = await apiWrite<{ counts: Record<string, number> }>('/api/backup/restore', { backup, pin: c.pin }, 'POST', { queue: false });
      toast(`Restored ${Object.values(res?.counts ?? {}).reduce((a, b) => a + b, 0)} records`);
      window.location.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'invalid_backup';
      toast(
        code === 'wrong_pin'
          ? 'Wrong PIN — nothing was changed'
          : code === 'unknown_table' || code === 'unknown_column' || code === 'invalid_backup'
            ? 'That backup file failed validation — your data is untouched'
            : 'Could not restore the backup',
        'error',
      );
    } finally {
      setRestoring(false);
      if (restoreRef.current) restoreRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold text-ink">Settings</h2>

      <Card>
        <CardTitle title="Appearance" icon={<Palette className="h-4 w-4" />} />
        <Segmented
          value={settings.theme}
          onChange={(v) => void setSettings({ theme: v })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
        <p className="mt-2 text-[12px] text-muted">Dark mode is the default for the shop floor.</p>
      </Card>

      {can('settings.manage') ? (
        <>
          <Card>
            <CardTitle title="Shop" icon={<Store className="h-4 w-4" />} />
            <div className="space-y-3">
              <Field label="Shop name">
                <TextInput value={shopName} onChange={setShopName} />
              </Field>
              <Field label="Shop phone">
                <TextInput value={shopPhone} onChange={setShopPhone} inputMode="tel" />
              </Field>
              <Field label="Address">
                <TextInput value={shopAddress} onChange={setShopAddress} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Currency">
                  <TextInput value={currency} onChange={setCurrency} />
                </Field>
                <Field label="Timezone" hint="Fixed for this shop">
                  <TextInput value={settings.timezone} onChange={() => undefined} disabled />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle title="Order defaults" />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Order number prefix" hint={`e.g. ${prefix || 'GO'}-${dubaiDate().slice(0, 4)}-0001`}>
                  <TextInput value={prefix} onChange={setPrefix} />
                </Field>
                <Field label="Number padding">
                  <NumberInput value={padding} onChange={setPadding} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Default weight tolerance">
                  <NumberInput value={tolerance} onChange={setTolerance} suffix="g" />
                </Field>
                <Field label="Default making charge">
                  <NumberInput value={making} onChange={setMaking} suffix={`${currency}/g`} />
                </Field>
              </div>
              <Field label="Default VAT">
                <NumberInput value={vat} onChange={setVat} suffix="%" />
              </Field>
              <Field label="Weight precision" hint="Weights always store 3 decimals; this controls rounding on display.">
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
            <CardTitle title="Lists" subtitle="Comma separated" />
            <div className="space-y-3">
              <Field label="Karats">
                <TextInput value={lists.karats} onChange={(v) => setLists((l) => ({ ...l, karats: v }))} />
              </Field>
              <Field label="Styles">
                <TextInput value={lists.styles} onChange={(v) => setLists((l) => ({ ...l, styles: v }))} />
              </Field>
              <Field label="Categories">
                <TextInput value={lists.categories} onChange={(v) => setLists((l) => ({ ...l, categories: v }))} />
              </Field>
              <Field label="Payment methods">
                <TextInput value={lists.paymentMethods} onChange={(v) => setLists((l) => ({ ...l, paymentMethods: v }))} />
              </Field>
              <Field label="Destinations">
                <TextInput value={lists.destinations} onChange={(v) => setLists((l) => ({ ...l, destinations: v }))} />
              </Field>
            </div>
          </Card>

          <button type="button" className="btn-primary w-full" onClick={() => void saveShop()} disabled={saving}>
            {saving ? <Spinner /> : null}
            Save settings
          </button>
        </>
      ) : null}

      <Card>
        <CardTitle title="Security PIN" subtitle="Required to delete a payment or restore a backup" icon={<KeyRound className="h-4 w-4" />} />
        <div className="space-y-3">
          {user?.hasPin ? (
            <Field label="Current PIN">
              <input className="input num" type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} />
            </Field>
          ) : null}
          <Field label="New PIN" hint="4–8 digits. Leave empty to remove the PIN.">
            <input className="input num" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          </Field>
          <button type="button" className="btn-ghost w-full" onClick={() => void savePin()}>
            {user?.hasPin ? 'Update PIN' : 'Set PIN'}
          </button>
        </div>
      </Card>

      {can('user.manage') ? (
        <Card>
          <CardTitle title="Staff" subtitle="Managers and employees share this shop's data" icon={<Users className="h-4 w-4" />} />
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
              <TextInput value={newStaff.username} onChange={(v) => setNewStaff((s) => ({ ...s, username: v }))} placeholder="username" ariaLabel="New staff username" />
              <TextInput value={newStaff.password} onChange={(v) => setNewStaff((s) => ({ ...s, password: v }))} type="password" placeholder="password" ariaLabel="New staff password" />
            </div>
            <TextInput value={newStaff.displayName} onChange={(v) => setNewStaff((s) => ({ ...s, displayName: v }))} placeholder="Display name" ariaLabel="New staff display name" />
            <Select
              value={newStaff.role}
              onChange={(v) => setNewStaff((s) => ({ ...s, role: v }))}
              ariaLabel="New staff role"
              options={[
                { value: 'employee', label: 'Employee — create and update orders, no deletes' },
                { value: 'manager', label: 'Manager — orders, customers, payments, reports' },
              ]}
            />
            <button type="button" className="btn-ghost w-full" onClick={() => void addStaff()}>
              Add staff account
            </button>
          </div>
        </Card>
      ) : null}

      {can('backup.manage') ? (
        <Card>
          <CardTitle title="Backup" subtitle="A full JSON copy of this shop's data" icon={<Database className="h-4 w-4" />} />
          <div className="space-y-2">
            <a href="/api/backup/export" className="btn-ghost w-full">
              <Download className="h-4 w-4" /> Download full backup
            </a>
            <a href="/api/backup/export?media=0" className="btn-ghost w-full">
              <Download className="h-4 w-4" /> Download backup without photos
            </a>
            <button type="button" className="btn-ghost w-full" onClick={() => restoreRef.current?.click()} disabled={restoring}>
              {restoring ? <Spinner /> : <Upload className="h-4 w-4" />}
              Restore from backup
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
              A restore replaces this shop&apos;s data only after the file passes validation.
            </p>
          </div>
        </Card>
      ) : null}

      {can('audit.view') ? (
        <Card>
          <CardTitle title="Audit log" subtitle="Every create, edit, delete and status change" />
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={async () => {
              try {
                const d = await apiGet<{ entries: unknown[] }>('/api/audit?limit=1000');
                download(`gold-orders-audit-${dubaiDate()}.json`, JSON.stringify(d.entries, null, 2));
              } catch {
                toast('Could not download the audit log', 'error');
              }
            }}
          >
            <Download className="h-4 w-4" /> Download audit log
          </button>
        </Card>
      ) : null}

      <p className="pb-2 text-center text-[11px] text-muted">
        GOLD ORDERS · Asia/Dubai · money to 2 decimals · weight to 3 decimals
      </p>
    </div>
  );
}
