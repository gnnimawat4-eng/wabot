'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Megaphone, Clock, CheckCircle2, XCircle, Loader2,
  Calendar, Users, Tag, Ban, Send, Trash2, AlertCircle,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { getBroadcasts, createBroadcast, cancelBroadcast, deleteBroadcast } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

type BroadcastStatus = 'draft' | 'scheduled' | 'queued' | 'sending' | 'completed' | 'failed' | 'cancelled';

interface Broadcast {
  id: string;
  name: string;
  message: string | null;
  template_name: string | null;
  status: BroadcastStatus;
  sent_count: number;
  failed_count: number;
  recipient_count: number;
  scheduled_at: string | null;
  created_at: string;
  audience_filter: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Status badge ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BroadcastStatus, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  draft:     { label: 'Draft',     icon: <AlertCircle className="h-3 w-3" />,  bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
  scheduled: { label: 'Scheduled', icon: <Clock       className="h-3 w-3" />,  bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  queued:    { label: 'Queued',    icon: <Loader2     className="h-3 w-3 animate-spin" />, bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  sending:   { label: 'Sending',   icon: <Loader2     className="h-3 w-3 animate-spin" />, bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  completed: { label: 'Sent',      icon: <CheckCircle2 className="h-3 w-3" />, bg: 'rgba(34,197,94,0.15)',   text: '#4ade80' },
  failed:    { label: 'Failed',    icon: <XCircle     className="h-3 w-3" />,  bg: 'rgba(239,68,68,0.15)',   text: '#f87171' },
  cancelled: { label: 'Cancelled', icon: <Ban         className="h-3 w-3" />,  bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
};

function StatusBadge({ status }: { status: BroadcastStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.text }}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── Create Dialog ─────────────────────────────────────────────────────────

interface CreateForm {
  name: string;
  message: string;
  targetType: 'all' | 'tag';
  targetTag: string;
  scheduleMode: 'now' | 'later';
  scheduledAt: string;
}

const EMPTY_FORM: CreateForm = {
  name: '', message: '', targetType: 'all', targetTag: '',
  scheduleMode: 'now', scheduledAt: '',
};

function CreateDialog({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => createBroadcast(workspaceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcasts', workspaceId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message || 'Failed to create broadcast'),
  });

  function handleSubmit() {
    setError('');
    if (!form.name.trim())    return setError('Name is required');
    if (!form.message.trim()) return setError('Message is required');
    if (form.scheduleMode === 'later' && !form.scheduledAt) return setError('Please select a date and time');

    const target =
      form.targetType === 'tag' && form.targetTag.trim()
        ? { type: 'tag', value: form.targetTag.trim() }
        : { type: 'all' };

    create.mutate({
      name:         form.name.trim(),
      message:      form.message.trim(),
      target,
      scheduled_at: form.scheduleMode === 'later' ? new Date(form.scheduledAt).toISOString() : null,
    });
  }

  const inp  = 'w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-green-500/40';
  const inpS = { background: 'var(--wb-input)', borderColor: 'var(--wb-input-border)', color: 'var(--wb-text)' };

  // Minimum datetime — now + 5 min
  const minDt = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4"
        style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>

        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--wb-text)' }}>New Broadcast</h2>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--wb-text-3)' }}>✕</button>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>
            Broadcast Name
          </label>
          <input className={inp} style={inpS} placeholder="e.g. Weekend Offer"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        {/* Message */}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>
            Message
          </label>
          <textarea rows={4} className={`${inp} resize-none`} style={inpS}
            placeholder="Hi {{name}}, we have a special offer for you…"
            value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <p className="text-xs mt-1" style={{ color: 'var(--wb-text-3)' }}>
            Sent to opted-in contacts only. Use plain text.
          </p>
        </div>

        {/* Target */}
        <div>
          <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--wb-text-2)' }}>
            Recipients
          </label>
          <div className="space-y-1.5">
            {([
              { v: 'all',  icon: <Users className="h-3.5 w-3.5" />, label: 'All opted-in contacts' },
              { v: 'tag',  icon: <Tag   className="h-3.5 w-3.5" />, label: 'Filter by tag'         },
            ] as const).map(({ v, icon, label }) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="target" value={v}
                  checked={form.targetType === v}
                  onChange={() => setForm({ ...form, targetType: v })}
                  className="accent-green-500" />
                {icon}
                <span className="text-sm" style={{ color: 'var(--wb-text)' }}>{label}</span>
              </label>
            ))}
          </div>
          {form.targetType === 'tag' && (
            <input className={`${inp} mt-2`} style={inpS} placeholder="Tag name (e.g. vip)"
              value={form.targetTag} onChange={(e) => setForm({ ...form, targetTag: e.target.value })} />
          )}
        </div>

        {/* Schedule */}
        <div>
          <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--wb-text-2)' }}>
            When to send
          </label>
          <div className="space-y-1.5">
            {([
              { v: 'now',   icon: <Send     className="h-3.5 w-3.5" />, label: 'Send now'          },
              { v: 'later', icon: <Calendar className="h-3.5 w-3.5" />, label: 'Schedule for later' },
            ] as const).map(({ v, icon, label }) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="schedule" value={v}
                  checked={form.scheduleMode === v}
                  onChange={() => setForm({ ...form, scheduleMode: v })}
                  className="accent-green-500" />
                {icon}
                <span className="text-sm" style={{ color: 'var(--wb-text)' }}>{label}</span>
              </label>
            ))}
          </div>
          {form.scheduleMode === 'later' && (
            <input type="datetime-local" min={minDt}
              className={`${inp} mt-2`} style={{ ...inpS, colorScheme: 'dark' }}
              value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 text-white" onClick={onClose}
            style={{ color: 'var(--wb-text-2)', borderColor: 'var(--wb-border)' }}>
            Cancel
          </Button>
          <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Scheduling…</>
            ) : form.scheduleMode === 'later' ? (
              <><Calendar className="h-3.5 w-3.5 mr-1.5" />Schedule</>
            ) : (
              <><Send className="h-3.5 w-3.5 mr-1.5" />Send Now</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Broadcast Row ─────────────────────────────────────────────────────────

function BroadcastRow({
  b, workspaceId,
}: {
  b: Broadcast;
  workspaceId: string;
}) {
  const qc = useQueryClient();

  const cancel = useMutation({
    mutationFn: () => cancelBroadcast(workspaceId, b.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts', workspaceId] }),
  });

  const remove = useMutation({
    mutationFn: () => deleteBroadcast(workspaceId, b.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts', workspaceId] }),
  });

  const canCancel = b.status === 'scheduled' || b.status === 'queued';
  const preview   = b.message || b.template_name || '—';
  const total     = b.recipient_count || (b.sent_count + b.failed_count) || 0;
  const sentPct   = total > 0 ? Math.round((b.sent_count / total) * 100) : 0;

  return (
    <div className="rounded-xl p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4 transition-colors"
      style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>

      {/* Icon */}
      <div className="p-2.5 rounded-lg shrink-0 self-start"
        style={{ background: 'var(--wb-bg-active)' }}>
        <Megaphone className="h-4 w-4" style={{ color: 'var(--wb-accent)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--wb-text)' }}>{b.name}</p>
          <StatusBadge status={b.status as BroadcastStatus} />
        </div>
        <p className="text-xs truncate mb-2" style={{ color: 'var(--wb-text-3)' }}>{preview}</p>

        <div className="flex items-center gap-4 flex-wrap text-xs" style={{ color: 'var(--wb-text-3)' }}>
          {/* Recipients */}
          {total > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {b.status === 'completed' || b.status === 'sending'
                ? `${b.sent_count}/${total} sent`
                : `${total} recipients`}
              {b.failed_count > 0 && (
                <span className="text-red-400 ml-0.5">· {b.failed_count} failed</span>
              )}
            </span>
          )}

          {/* Scheduled at */}
          {b.scheduled_at && b.status === 'scheduled' && (
            <span className="flex items-center gap-1 text-blue-400">
              <Calendar className="h-3 w-3" />{fmtDate(b.scheduled_at)}
            </span>
          )}

          {/* Created at */}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{relativeTime(b.created_at)}
          </span>
        </div>

        {/* Progress bar for sending/completed */}
        {(b.status === 'sending' || b.status === 'completed') && total > 0 && (
          <div className="mt-2 h-1 rounded-full overflow-hidden"
            style={{ background: 'var(--wb-border)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${sentPct}%`, background: 'var(--wb-accent)' }} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {canCancel && (
          <button onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            title="Cancel broadcast"
            className="p-1.5 rounded-lg text-xs transition-colors hover:bg-orange-500/10 text-orange-400 disabled:opacity-40">
            {cancel.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Ban className="h-3.5 w-3.5" />}
          </button>
        )}
        {(b.status === 'completed' || b.status === 'failed' || b.status === 'cancelled') && (
          <button onClick={() => remove.mutate()}
            disabled={remove.isPending}
            title="Delete"
            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 text-red-400 disabled:opacity-40">
            {remove.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function BroadcastsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: broadcasts = [], isLoading } = useQuery<Broadcast[]>({
    queryKey: ['broadcasts', activeWorkspace?.id],
    queryFn: () => getBroadcasts(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval: 10_000,
  });

  const scheduled  = broadcasts.filter((b) => b.status === 'scheduled');
  const active     = broadcasts.filter((b) => b.status === 'queued' || b.status === 'sending');
  const history    = broadcasts.filter((b) => !['scheduled', 'queued', 'sending'].includes(b.status));

  return (
    <AppShell>
      <div className="p-6 max-w-3xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--wb-text)' }}>Broadcasts</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--wb-text-3)' }}>
              Send WhatsApp messages to your contacts
            </p>
          </div>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />New Broadcast
          </Button>
        </div>

        {!activeWorkspace ? (
          <p className="text-sm py-12 text-center" style={{ color: 'var(--wb-text-3)' }}>
            Create a workspace first in Settings.
          </p>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl animate-pulse"
                style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }} />
            ))}
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center"
            style={{ borderColor: 'var(--wb-border)' }}>
            <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-20" style={{ color: 'var(--wb-text)' }} />
            <p className="text-sm mb-4" style={{ color: 'var(--wb-text-3)' }}>
              No broadcasts yet — create one to reach all your contacts
            </p>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />New Broadcast
            </Button>
          </div>
        ) : (
          <div className="space-y-6">

            {active.length > 0 && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--wb-text-3)' }}>Active</p>
                <div className="space-y-2">
                  {active.map((b) => (
                    <BroadcastRow key={b.id} b={b} workspaceId={activeWorkspace.id} />
                  ))}
                </div>
              </section>
            )}

            {scheduled.length > 0 && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--wb-text-3)' }}>Scheduled</p>
                <div className="space-y-2">
                  {scheduled.map((b) => (
                    <BroadcastRow key={b.id} b={b} workspaceId={activeWorkspace.id} />
                  ))}
                </div>
              </section>
            )}

            {history.length > 0 && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--wb-text-3)' }}>History</p>
                <div className="space-y-2">
                  {history.map((b) => (
                    <BroadcastRow key={b.id} b={b} workspaceId={activeWorkspace.id} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {dialogOpen && activeWorkspace && (
        <CreateDialog
          workspaceId={activeWorkspace.id}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </AppShell>
  );
}
