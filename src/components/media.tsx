'use client';

import { useRef, useState } from 'react';
import { Camera, ImagePlus, Star, Trash2, Video } from 'lucide-react';
import { useApp } from './providers';
import { Modal, Select, Spinner } from './ui';
import { apiWrite, compressImage, uuid } from '@/lib/client';
import { MEDIA_CATEGORIES, type OrderMedia } from '@/lib/types';

/** Photos are compressed and thumbnailed on the device before upload. */
export async function buildMediaPayload(file: File, category: string, orderId?: string | null) {
  const { data, thumb, mime, size } = await compressImage(file);
  return {
    id: uuid(),
    orderId: orderId ?? null,
    name: file.name.slice(0, 200),
    mime,
    size,
    category,
    data,
    thumb,
  };
}

export function MediaGallery({
  orderId,
  media,
  coverMediaId,
  onChange,
  readOnly,
}: {
  orderId: string;
  media: OrderMedia[];
  coverMediaId: string | null;
  onChange: (media: OrderMedia[], coverMediaId?: string | null) => void;
  readOnly?: boolean;
}) {
  const { toast, confirm } = useApp();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<string>('Reference Photo');
  const [viewing, setViewing] = useState<OrderMedia | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      let latest = media;
      for (const file of Array.from(files).slice(0, 10)) {
        if (file.size > 20_000_000) {
          toast(`${file.name} is larger than 20 MB`, 'error');
          continue;
        }
        const payload = await buildMediaPayload(file, category, orderId);
        const res = await apiWrite<{ media: OrderMedia[] }>(`/api/orders/${orderId}/media`, payload, 'POST', {
          label: `Photo for order ${orderId}`,
        });
        if (res) latest = res.media;
      }
      onChange(latest);
      toast('Media saved');
    } catch {
      toast('Could not save the media', 'error');
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (libraryRef.current) libraryRef.current.value = '';
    }
  };

  const setCover = async (m: OrderMedia) => {
    await apiWrite(`/api/media/${m.id}`, { setAsCover: true }, 'PATCH', { label: 'Set cover photo' });
    onChange(media, m.id);
    toast('Cover photo updated');
  };

  const remove = async (m: OrderMedia) => {
    const c = await confirm({
      title: 'Remove this file?',
      body: 'It is archived, not destroyed — the audit log keeps the record.',
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!c.ok) return;
    await apiWrite(`/api/media/${m.id}?reason=${encodeURIComponent(c.reason ?? '')}`, null, 'DELETE', { label: 'Remove media' });
    onChange(media.filter((x) => x.id !== m.id), coverMediaId === m.id ? null : coverMediaId);
    toast('File removed');
  };

  return (
    <div className="space-y-3">
      {!readOnly ? (
        <>
          <Select
            value={category}
            onChange={setCategory}
            ariaLabel="Photo category"
            options={MEDIA_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => cameraRef.current?.click()} disabled={busy}>
              {busy ? <Spinner /> : <Camera className="h-4 w-4" />}
              Camera
            </button>
            <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => libraryRef.current?.click()} disabled={busy}>
              <ImagePlus className="h-4 w-4" />
              Library / File
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
        </>
      ) : null}

      {media.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">
          No photos or videos yet.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {media.map((m) => (
            <li key={m.id} className="relative">
              <button type="button" className="block w-full" onClick={() => setViewing(m)} aria-label={`Open ${m.name}`}>
                {m.kind === 'photo' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumb ?? `/api/media/${m.id}`}
                    alt={m.category}
                    loading="lazy"
                    decoding="async"
                    className={`aspect-square w-full rounded-xl border object-cover ${
                      coverMediaId === m.id ? 'border-gold' : 'border-line'
                    }`}
                  />
                ) : (
                  <span className="grid aspect-square w-full place-items-center rounded-xl border border-line bg-surface2 text-muted">
                    <Video className="h-6 w-6" />
                  </span>
                )}
              </button>
              {coverMediaId === m.id ? (
                <span className="absolute start-1 top-1 rounded-md bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">
                  Cover
                </span>
              ) : null}
              <span className="mt-1 block truncate text-[10px] text-muted">{m.category}</span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.category ?? 'Media'} wide>
        {viewing ? (
          <>
            {viewing.kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${viewing.id}`} alt={viewing.name} className="w-full rounded-xl border border-line" />
            ) : viewing.kind === 'video' ? (
              <video src={`/api/media/${viewing.id}`} controls playsInline className="w-full rounded-xl border border-line" />
            ) : (
              <a href={`/api/media/${viewing.id}`} className="btn-ghost w-full" target="_blank" rel="noreferrer">
                Open file
              </a>
            )}
            <p className="text-[12px] text-muted">{viewing.name}</p>
            {!readOnly ? (
              <div className="flex gap-2">
                {viewing.kind === 'photo' ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm flex-1"
                    onClick={() => {
                      void setCover(viewing);
                      setViewing(null);
                    }}
                  >
                    <Star className="h-4 w-4" /> Set as cover
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-danger btn-sm flex-1"
                  onClick={() => {
                    void remove(viewing);
                    setViewing(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </div>
  );
}

/**
 * Upload widget for the create screen, where no order id exists yet. Files are
 * held locally and attached once the order is saved.
 */
export function PendingMediaPicker({
  files,
  onChange,
}: {
  files: { id: string; name: string; preview: string; payload: Record<string, unknown> }[];
  onChange: (files: { id: string; name: string; preview: string; payload: Record<string, unknown> }[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2">
      <button type="button" className="btn-ghost btn-sm w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <Spinner /> : <Camera className="h-4 w-4" />}
        Add photo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const list = e.target.files;
          if (!list?.length) return;
          setBusy(true);
          try {
            const next = [...files];
            for (const file of Array.from(list).slice(0, 6)) {
              const payload = await buildMediaPayload(file, 'Reference Photo');
              next.push({ id: String(payload.id), name: file.name, preview: payload.thumb ?? payload.data, payload });
            }
            onChange(next);
          } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
          }
        }}
      />
      {files.length ? (
        <ul className="grid grid-cols-4 gap-2">
          {files.map((f) => (
            <li key={f.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.preview} alt={f.name} className="aspect-square w-full rounded-lg border border-line object-cover" />
              <button
                type="button"
                className="absolute -end-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-bad text-white"
                onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                aria-label={`Remove ${f.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
