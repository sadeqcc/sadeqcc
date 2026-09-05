'use client';

import { useState } from 'react';
import { Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useApp } from './providers';
import { CardTitle, Modal, Spinner, TextArea, Toggle } from './ui';
import { apiWrite, uuid } from '@/lib/client';
import { dubaiStamp } from '@/lib/date';
import type { OrderNote } from '@/lib/types';

export function NotesPanel({
  orderId,
  notes,
  onChange,
}: {
  orderId: string;
  notes: OrderNote[];
  onChange: (notes: OrderNote[]) => void;
}) {
  const { toast, confirm, can } = useApp();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await apiWrite<{ notes: OrderNote[] }>(
        `/api/orders/${orderId}/notes`,
        { id: uuid(), text: text.trim(), pinned },
        'POST',
        { label: 'Order note' },
      );
      if (res) onChange(res.notes);
      setText('');
      setPinned(false);
      setAdding(false);
      toast('Note saved');
    } catch {
      toast('Could not save the note', 'error');
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (note: OrderNote) => {
    const next = note.pinned ? 0 : 1;
    await apiWrite(`/api/notes/${note.id}`, { pinned: !!next }, 'PATCH', { label: 'Pin note' });
    onChange(
      [...notes.map((x) => (x.id === note.id ? { ...x, pinned: next } : x))].sort(
        (a, b) => b.pinned - a.pinned || (a.createdAt < b.createdAt ? 1 : -1),
      ),
    );
  };

  const remove = async (note: OrderNote) => {
    const c = await confirm({ title: 'Delete this note?', danger: true, confirmLabel: 'Delete' });
    if (!c.ok) return;
    await apiWrite(`/api/notes/${note.id}`, null, 'DELETE', { label: 'Delete note' });
    onChange(notes.filter((x) => x.id !== note.id));
    toast('Note deleted');
  };

  return (
    <>
      <CardTitle
        title="Notes"
        subtitle={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
        action={
          can('order.edit') ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add
            </button>
          ) : null
        }
      />

      {notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-[13px] text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className={`rounded-xl border px-3 py-2.5 ${note.pinned ? 'border-gold/60 bg-gold/5' : 'border-line bg-surface2'}`}
            >
              {note.pinned ? <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gold">📌 Important</p> : null}
              <p className="whitespace-pre-wrap text-[13px] text-ink">{note.text}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="num text-[11px] text-muted">
                  {dubaiStamp(note.createdAt)}
                  {note.createdByName ? ` · ${note.createdByName}` : ''}
                </span>
                {can('order.edit') ? (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted hover:text-gold"
                      onClick={() => void togglePin(note)}
                      aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                    >
                      {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted hover:text-bad"
                      onClick={() => void remove(note)}
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add note"
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => void save()} disabled={busy || !text.trim()}>
              {busy ? <Spinner /> : null}
              Save note
            </button>
          </>
        }
      >
        <TextArea value={text} onChange={setText} rows={4} placeholder="Customer wedding is 30 September — deliver before 25 September." />
        <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
          <span className="text-[13px] text-ink">Pin as important</span>
          <Toggle checked={pinned} onChange={setPinned} label="Pin note" />
        </div>
      </Modal>
    </>
  );
}
