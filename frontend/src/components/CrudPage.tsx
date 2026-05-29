'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataRow = Record<string, unknown> & { id: string };

export interface ColumnDef {
  key: string;
  label: string;
  className?: string;
  render?: (value: unknown, row: DataRow) => React.ReactNode;
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}

interface CrudPageProps {
  title: string;
  subtitle?: string;
  emptyIcon?: string;
  emptyMessage?: string;
  addLabel?: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  queryKey: string;
  fetchFn: (workspaceId: string) => Promise<DataRow[]>;
  createFn: (workspaceId: string, data: Record<string, string>) => Promise<DataRow>;
  deleteFn: (workspaceId: string, id: string) => Promise<unknown>;
  refetchInterval?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  scheduled:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  done:       'bg-green-500/15 text-green-400 border-green-500/25',
  completed:  'bg-green-500/15 text-green-400 border-green-500/25',
  paid:       'bg-green-500/15 text-green-400 border-green-500/25',
  available:  'bg-green-500/15 text-green-400 border-green-500/25',
  active:     'bg-green-500/15 text-green-400 border-green-500/25',
  cancelled:  'bg-red-500/15 text-red-400 border-red-500/25',
  sold:       'bg-gray-500/15 text-gray-300 border-gray-500/25',
  rented:     'bg-purple-500/15 text-purple-400 border-purple-500/25',
  new:        'bg-blue-500/15 text-blue-400 border-blue-500/25',
  hot:        'bg-orange-500/15 text-orange-400 border-orange-500/25',
  cold:       'bg-slate-500/15 text-slate-400 border-slate-500/25',
  converted:  'bg-green-500/15 text-green-400 border-green-500/25',
  pending:    'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  reserved:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  inactive:   'bg-gray-500/15 text-gray-400 border-gray-500/25',
  unavailable:'bg-red-500/15 text-red-400 border-red-500/25',
};

export function statusBadge(v: unknown) {
  const s = String(v ?? '');
  if (!s) return <span className="text-white/20">—</span>;
  const key = s.toLowerCase().replace(/\s+/g, '');
  const cls = STATUS_CLS[key] ?? 'bg-white/10 text-white/60 border-white/15';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {s}
    </span>
  );
}

export function fmtDateTime(v: unknown) {
  const s = v as string | null;
  if (!s) return <span className="text-white/20">—</span>;
  try {
    const d = new Date(s);
    return (
      <span className="text-white/80">
        {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        {' '}
        <span className="text-white/40 text-xs">
          {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </span>
    );
  } catch { return <span>{s}</span>; }
}

export function fmtDate(v: unknown) {
  const s = v as string | null;
  if (!s) return <span className="text-white/20">—</span>;
  try {
    const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return <span>{s}</span>; }
}

export function fmtPrice(v: unknown) {
  const n = Number(v);
  if (!v && v !== 0) return <span className="text-white/20">—</span>;
  return <span>₹{n.toLocaleString('en-IN')}</span>;
}

// ── CrudPage ──────────────────────────────────────────────────────────────────

export default function CrudPage({
  title, subtitle, emptyIcon = '📋', emptyMessage = 'No records yet', addLabel = 'Add',
  columns, fields, queryKey, fetchFn, createFn, deleteFn, refetchInterval,
}: CrudPageProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery<DataRow[]>({
    queryKey: [queryKey, activeWorkspace?.id],
    queryFn: () => fetchFn(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn(activeWorkspace!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey, activeWorkspace?.id] });
      setConfirmDelete(null);
      toast.success('Deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const openAdd = () => {
    const defaults: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.defaultValue) defaults[f.key] = f.defaultValue;
      else if (f.options?.length) defaults[f.key] = f.options[0];
    });
    setForm(defaults);
    setShowAdd(true);
  };

  const handleAdd = async () => {
    if (!activeWorkspace) return;
    const missing = fields.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length) { toast.error(`${missing[0].label} is required`); return; }
    setAdding(true);
    try {
      await createFn(activeWorkspace.id, form);
      qc.invalidateQueries({ queryKey: [queryKey, activeWorkspace.id] });
      setShowAdd(false);
      setForm({});
      toast.success('Added successfully');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as Error)?.message || 'Failed to add';
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  return (
    <AppShell>
      <div className="p-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>}
          </div>
          {activeWorkspace && (
            <Button size="sm" onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white">
              <Plus className="h-3.5 w-3.5 mr-1.5" />{addLabel}
            </Button>
          )}
        </div>

        {/* No workspace */}
        {!activeWorkspace && (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <p className="text-white/40 text-sm">Select a workspace to get started.</p>
          </div>
        )}

        {/* Loading */}
        {activeWorkspace && isLoading && (
          <div className="rounded-xl bg-white/5 border border-white/8 p-8 text-center text-white/30 text-sm animate-pulse">Loading…</div>
        )}

        {/* Empty */}
        {activeWorkspace && !isLoading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-14 text-center">
            <p className="text-4xl mb-3">{emptyIcon}</p>
            <p className="text-white/40 text-sm mb-4">{emptyMessage}</p>
            <Button size="sm" onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white">
              <Plus className="h-3.5 w-3.5 mr-1.5" />{addLabel}
            </Button>
          </div>
        )}

        {/* Table */}
        {activeWorkspace && !isLoading && rows.length > 0 && (
          <div className="rounded-xl border border-white/8 overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  {columns.map((col) => (
                    <th key={col.key} className={`text-left text-xs text-white/40 font-medium px-4 py-3 ${col.className ?? ''}`}>
                      {col.label}
                    </th>
                  ))}
                  <th className="w-16 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} className={`border-b border-white/5 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-white/80 ${col.className ?? ''}`}>
                        {col.render
                          ? col.render(row[col.key], row)
                          : row[col.key] != null
                            ? String(row[col.key])
                            : <span className="text-white/20">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      {confirmDelete === row.id ? (
                        <span className="flex items-center gap-2 justify-end">
                          <button onClick={() => deleteMut.mutate(row.id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Delete?</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-white/30 hover:text-white/60">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDelete(row.id)} className="text-white/20 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#252525] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">{addLabel}</h2>
                <button onClick={() => setShowAdd(false)} className="text-white/40 hover:text-white/70"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4">
                {fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs text-white/50 mb-1.5">
                      {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={form[field.key] ?? ''}
                        onChange={(e) => set(field.key, e.target.value)}
                        className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60"
                        style={{ colorScheme: 'dark' }}
                      >
                        {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={form[field.key] ?? ''}
                        onChange={(e) => set(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20 resize-none"
                      />
                    ) : (
                      <input
                        type={field.type}
                        value={form[field.key] ?? ''}
                        onChange={(e) => set(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-green-500/60 placeholder:text-white/20"
                        style={['date', 'time'].includes(field.type) ? { colorScheme: 'dark' } : {}}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <Button onClick={() => setShowAdd(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10">Cancel</Button>
                <Button onClick={handleAdd} disabled={adding} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  {adding ? 'Adding…' : addLabel}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
