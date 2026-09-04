'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiWrite, cache, uuid } from './client';
import { formatGold } from './num';
import { summarizeDay, suggestForDifference, type DaySummary } from './calc';
import type {
  AppSettings,
  CashAdjustment,
  CashEntry,
  GoldMovement,
  GoldRow,
  DayRecord,
} from './types';
import { DEFAULT_SETTINGS } from './types';

export interface DayPayload {
  day: DayRecord | null;
  entries: CashEntry[];
  adjustments: CashAdjustment[];
  goldRows: GoldRow[];
  movements: GoldMovement[];
  settings: AppSettings;
  date: string;
  shift: string;
}

const empty = (date: string): DayPayload => ({
  day: null,
  entries: [],
  adjustments: [],
  goldRows: [],
  movements: [],
  settings: DEFAULT_SETTINGS,
  date,
  shift: 'main',
});

export interface UseDay {
  payload: DayPayload;
  summary: DaySummary;
  suggestions: ReturnType<typeof suggestForDifference>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  locked: boolean;
  lastSavedAt: string | null;
  refresh: () => Promise<void>;
  ensureDay: () => Promise<string | null>;
  saveDay: (patch: Record<string, unknown>, immediate?: boolean) => Promise<void>;
  addRecord: (entity: 'cash_entries' | 'cash_adjustments' | 'gold_movements', body: Record<string, unknown>) => Promise<boolean>;
  patchRecord: (entity: 'cash_entries' | 'cash_adjustments' | 'gold_movements', id: string, body: Record<string, unknown>) => Promise<boolean>;
  deleteRecord: (entity: 'cash_entries' | 'cash_adjustments' | 'gold_movements', id: string, reason?: string) => Promise<boolean>;
  saveGold: (karat: string, patch: { systemMg?: number; drawerMg?: number }) => Promise<void>;
  returnMovement: (id: string, returnedMg: number, returnDate?: string) => Promise<boolean>;
}

export function useDay(date: string, shift = 'main'): UseDay {
  const [payload, setPayload] = useState<DayPayload>(() => empty(date));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<Record<string, unknown>>({});

  const cacheKey = `day:${date}:${shift}`;

  const load = useCallback(async () => {
    try {
      const data = await apiGet<DayPayload>(`/api/day?date=${date}&shift=${shift}`);
      setPayload(data);
      cache.set(cacheKey, data);
      setError(null);
      setLastSavedAt(data.day?.updatedAt ?? null);
    } catch (e) {
      const cached = cache.get<DayPayload>(cacheKey);
      if (cached) {
        setPayload(cached);
        setError(null);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [date, shift, cacheKey]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const ensureDay = useCallback(async (): Promise<string | null> => {
    if (payload.day?.id) return payload.day.id;
    try {
      const data = await apiGet<DayPayload>(`/api/day?date=${date}&shift=${shift}&create=1`);
      setPayload(data);
      cache.set(cacheKey, data);
      return data.day?.id ?? null;
    } catch {
      return null;
    }
  }, [payload.day?.id, date, shift, cacheKey]);

  const flush = useCallback(async () => {
    const patch = queued.current;
    queued.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      await apiWrite('/api/day', { date, shift, ...patch });
      setLastSavedAt(new Date().toISOString());
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [date, shift, load]);

  /** Draft auto-save: every change is persisted, debounced to avoid a write per keystroke. */
  const saveDay = useCallback(
    async (patch: Record<string, unknown>, immediate = false) => {
      queued.current = { ...queued.current, ...patch };
      setPayload((p) =>
        p.day ? { ...p, day: { ...p.day, ...(patch as Partial<DayRecord>) } } : p,
      );
      if (timer.current) clearTimeout(timer.current);
      if (immediate) {
        await flush();
      } else {
        timer.current = setTimeout(() => void flush(), 700);
      }
    },
    [flush],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const addRecord: UseDay['addRecord'] = useCallback(
    async (entity, body) => {
      const dayId = entity === 'gold_movements' ? undefined : await ensureDay();
      if (entity !== 'gold_movements' && !dayId) return false;
      try {
        await apiWrite(`/api/records/${entity}`, { id: uuid(), ...(dayId ? { dayId } : {}), ...body });
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [ensureDay, load],
  );

  const patchRecord: UseDay['patchRecord'] = useCallback(
    async (entity, id, body) => {
      try {
        await apiWrite(`/api/records/${entity}/${id}`, body, 'PATCH');
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [load],
  );

  const deleteRecord: UseDay['deleteRecord'] = useCallback(
    async (entity, id, reason) => {
      try {
        await apiWrite(`/api/records/${entity}/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, null, 'DELETE');
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [load],
  );

  const saveGold = useCallback(
    async (karat: string, patch: { systemMg?: number; drawerMg?: number }) => {
      const dayId = await ensureDay();
      if (!dayId) return;
      setSaving(true);
      try {
        await apiWrite('/api/gold', {
          dayId,
          karat,
          ...(patch.systemMg === undefined ? {} : { systemMg: formatGold(patch.systemMg, false) }),
          ...(patch.drawerMg === undefined ? {} : { drawerMg: formatGold(patch.drawerMg, false) }),
        });
        setLastSavedAt(new Date().toISOString());
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [ensureDay, load],
  );

  const returnMovement = useCallback(
    async (id: string, returnedMg: number, returnDate?: string) => {
      try {
        await apiWrite(`/api/movements/${id}/return`, { returnedMg: formatGold(returnedMg, false), returnDate });
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [load],
  );

  const summary = useMemo(() => {
    // A finalized day is read from its snapshot: later movements must not
    // rewrite a closed day's numbers.
    const snap = payload.day?.snapshot as { results?: DaySummary } | null;
    if ((payload.day?.status === 'finalized' || payload.day?.status === 'locked') && snap?.results) {
      return snap.results;
    }
    return summarizeDay({
      physicalCashFils: payload.day?.physicalCashFils ?? 0,
      systemCashFils: payload.day?.systemCashFils ?? null,
      entries: payload.entries,
      adjustments: payload.adjustments,
      karats: payload.settings.karats,
      goldRows: payload.goldRows,
      movements: payload.movements,
      tolerances: payload.settings.tolerances,
      cashTolerance: payload.settings.cashTolerance,
    });
  }, [payload]);

  const suggestions = useMemo(
    () =>
      suggestForDifference({
        cash: summary.cash,
        gold: summary.gold,
        movements: payload.movements,
        entries: payload.entries,
      }),
    [summary, payload.movements, payload.entries],
  );

  const locked = payload.day?.status === 'finalized' || payload.day?.status === 'locked';

  return {
    payload,
    summary,
    suggestions,
    loading,
    saving,
    error,
    locked,
    lastSavedAt,
    refresh: load,
    ensureDay,
    saveDay,
    addRecord,
    patchRecord,
    deleteRecord,
    saveGold,
    returnMovement,
  };
}
