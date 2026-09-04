'use client';

import { useRef, useState } from 'react';
import { FileImage, Loader2, Paperclip, X } from 'lucide-react';
import { useApp } from './providers';

/** Uploads a receipt photo and hands back its id. The file lives owner-scoped in the DB. */
export function AttachmentPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t, toast } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/attachments', { method: 'POST', body: form });
      const json = (await res.json()) as { ok: boolean; data?: { id: string }; error?: string };
      if (!json.ok || !json.data) throw new Error(json.error ?? 'error');
      onChange(json.data.id);
      toast(t('saved'), 'ok');
    } catch {
      toast(t('error_generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="label mb-1.5">{t('attachment')}</span>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2">
          <FileImage className="h-4 w-4 text-gold" />
          <a href={`/api/attachments/${value}`} target="_blank" rel="noreferrer" className="flex-1 truncate text-[13px] text-info underline">
            {t('attach_receipt')}
          </a>
          <button className="rounded-lg p-1.5 text-muted hover:text-bad" onClick={() => onChange(null)} aria-label={t('delete')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button className="btn-ghost w-full text-[13px]" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          {t('attach_receipt')}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
