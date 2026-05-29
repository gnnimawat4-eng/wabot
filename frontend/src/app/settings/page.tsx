'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, AlertTriangle, Trash2, RotateCcw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceStore } from '@/lib/store';
import { createWorkspace, updateWorkspace, getSubscription, createSubscription, getTrash, restoreTrashItem, permanentDeleteTrashItem } from '@/lib/api';
import { BUSINESS_TYPES, type BusinessType } from '@/lib/businessConfig';
import { useTheme, type Theme } from '@/app/providers';
import { toast } from 'sonner';

const AI_LANGUAGES = [
  { value: 'auto', label: 'Auto-detect (recommended)' },
  { value: 'english', label: 'Always English' },
  { value: 'hindi', label: 'Always Hindi' },
];

type Section = 'workspace' | 'whatsapp' | 'ai' | 'billing' | 'trash';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--wb-text-2)' }}>{label}</label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--wb-text-3)' }}>{hint}</p>}
    </div>
  );
}

function Toggle({ enabled, onChange, label, description }: { enabled: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--wb-text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--wb-text-3)' }}>{description}</p>
      </div>
      <button onClick={() => onChange(!enabled)}
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
        style={{ background: enabled ? 'var(--wb-accent)' : 'var(--wb-border)' }}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function Divider() {
  return <div className="my-4 border-t" style={{ borderColor: 'var(--wb-border)' }} />;
}

type TrashItem = { id: string; name?: string; phone?: string; deleted_at: string };
type TrashData = { workspaces: TrashItem[]; contacts: TrashItem[]; flows: TrashItem[]; broadcasts: TrashItem[] };

type TrashTab = 'workspaces' | 'contacts' | 'flows' | 'broadcasts';

function TrashSection({ workspaceId, onRestore }: { workspaceId: string; onRestore: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TrashTab>('workspaces');
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; name: string } | null>(null);

  const { data: trash, isLoading } = useQuery<TrashData>({
    queryKey: ['trash', workspaceId],
    queryFn: () => getTrash(workspaceId),
    enabled: !!workspaceId,
  });

  const restore = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) =>
      restoreTrashItem(workspaceId, type, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash', workspaceId] });
      toast.success('Restored successfully!');
      onRestore();
    },
    onError: () => toast.error('Failed to restore'),
  });

  const permDelete = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) =>
      permanentDeleteTrashItem(workspaceId, type, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash', workspaceId] });
      setConfirmDelete(null);
      toast.success('Permanently deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const TABS: { id: TrashTab; label: string }[] = [
    { id: 'workspaces', label: 'Workspaces' },
    { id: 'contacts',   label: 'Contacts' },
    { id: 'flows',      label: 'Flows' },
    { id: 'broadcasts', label: 'Broadcasts' },
  ];

  const items: TrashItem[] = trash?.[tab] ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--wb-text)' }}>Recently Deleted</h2>
        <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>Items are permanently deleted after 30 days</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--wb-bg-hover)' }}>
        {TABS.map((t) => {
          const count = trash?.[t.id]?.length ?? 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1"
              style={tab === t.id ? { background: 'var(--wb-bg-sidebar)', color: 'var(--wb-text)' } : { color: 'var(--wb-text-3)' }}>
              {t.label}
              {count > 0 && (
                <span className="text-[10px] px-1 py-0.5 rounded-full bg-red-500/20 text-red-400 leading-none">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--wb-bg-hover)' }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ color: 'var(--wb-text-3)' }}>
          <Trash2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">No deleted items</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg px-4 py-3"
              style={{ border: '1px solid var(--wb-border)', background: 'var(--wb-bg)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--wb-text)' }}>
                  {item.name || item.phone || item.id}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--wb-text-3)' }}>
                  Deleted on: {new Date(item.deleted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={() => restore.mutate({ type: tab, id: item.id })}
                  disabled={restore.isPending}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'rgba(22,163,74,0.12)', color: '#16a34a' }}>
                  <RotateCcw className="h-3 w-3" />Restore
                </button>
                <button
                  onClick={() => setConfirmDelete({ type: tab, id: item.id, name: item.name || item.phone || item.id })}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  <Trash2 className="h-3 w-3" />Delete Forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Permanent delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmDelete(null)}>
          <div className="rounded-xl p-6 max-w-sm w-full shadow-2xl" style={{ background: 'var(--wb-bg-sidebar)', border: '1px solid var(--wb-border)' }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--wb-text)' }}>Delete permanently?</p>
            <p className="text-xs mb-5" style={{ color: 'var(--wb-text-3)' }}>
              This cannot be undone. "{confirmDelete.name}" will be gone forever.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ border: '1px solid var(--wb-border)', color: 'var(--wb-text-2)' }}>
                Cancel
              </button>
              <button
                onClick={() => permDelete.mutate({ type: confirmDelete.type, id: confirmDelete.id })}
                disabled={permDelete.isPending}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
                {permDelete.isPending ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'workspace', label: 'Workspace Settings' },
  { id: 'whatsapp',  label: 'WhatsApp Connection' },
  { id: 'ai',        label: 'AI Settings' },
  { id: 'billing',   label: 'Billing & Plans' },
];

export default function SettingsPage() {
  const { activeWorkspace, setWorkspaces, workspaces } = useWorkspaceStore();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<Section>('workspace');

  const [wsName, setWsName] = useState('');
  const [waForm, setWaForm] = useState({ wa_phone_number_id: '', wa_phone_number: '', wa_access_token: '', wa_business_id: '' });
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [btChanged, setBtChanged] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [langDetect, setLangDetect] = useState(false);
  const [aiLang, setAiLang] = useState('auto');
  const [aiSaved, setAiSaved] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');

  useEffect(() => {
    if (activeWorkspace) {
      setWsName(activeWorkspace.name ?? '');
      setWaForm({
        wa_phone_number_id: activeWorkspace.wa_phone_number_id ?? '',
        wa_phone_number: activeWorkspace.wa_phone_number ?? '',
        wa_access_token: activeWorkspace.wa_access_token ?? '',
        wa_business_id: activeWorkspace.wa_business_id ?? '',
      });
      setSystemPrompt(activeWorkspace.ai_system_prompt ?? '');
      setBusinessType((activeWorkspace.business_type as BusinessType) ?? null);
      setBtChanged(false);
    }
    const stored = localStorage.getItem('wabot_ai_settings');
    if (stored) {
      try {
        const { aiEnabled: ae, langDetect: ld, aiLang: al } = JSON.parse(stored);
        if (ae !== undefined) setAiEnabled(ae);
        if (ld !== undefined) setLangDetect(ld);
        if (al !== undefined) setAiLang(al);
      } catch { /* ignore */ }
    }
  }, [activeWorkspace]);

  const saveAiSystemPrompt = useMutation({
    mutationFn: () => updateWorkspace(activeWorkspace!.id, { ai_system_prompt: systemPrompt }),
    onSuccess: (result) => { setWorkspaces(workspaces.map((ws) => ws.id === result.id ? result : ws)); qc.invalidateQueries({ queryKey: ['workspaces'] }); },
    onError: () => toast.error('Failed to save system prompt'),
  });

  const saveAiSettings = () => {
    localStorage.setItem('wabot_ai_settings', JSON.stringify({ aiEnabled, langDetect, aiLang }));
    if (activeWorkspace) saveAiSystemPrompt.mutate();
    setAiSaved(true);
    toast.success('AI settings saved');
    setTimeout(() => setAiSaved(false), 2000);
  };

  const saveWorkspaceName = useMutation({
    mutationFn: () => activeWorkspace ? updateWorkspace(activeWorkspace.id, { name: wsName }) : createWorkspace(wsName),
    onSuccess: (result) => {
      setWorkspaces(activeWorkspace ? workspaces.map((ws) => ws.id === result.id ? result : ws) : [result]);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success(activeWorkspace ? 'Workspace saved' : 'Workspace created!');
    },
    onError: () => toast.error('Failed to save'),
  });

  const saveBusinessType = useMutation({
    mutationFn: () => updateWorkspace(activeWorkspace!.id, { business_type: businessType }),
    onSuccess: (result) => {
      setWorkspaces(workspaces.map((ws) => ws.id === result.id ? result : ws));
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      setBtChanged(false);
      toast.success('Business type updated');
    },
    onError: () => toast.error('Failed to save'),
  });

  const saveWa = useMutation({
    mutationFn: () => updateWorkspace(activeWorkspace!.id, waForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspaces'] }); toast.success('WhatsApp settings saved'); },
    onError: () => toast.error('Failed to save'),
  });

  const { data: sub } = useQuery({
    queryKey: ['subscription', activeWorkspace?.id],
    queryFn: () => getSubscription(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  });

  const { data: trash } = useQuery({
    queryKey: ['trash', activeWorkspace?.id],
    queryFn: () => getTrash(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval: 60_000,
  });
  const trashCount = trash
    ? (trash.workspaces?.length ?? 0) + (trash.contacts?.length ?? 0) + (trash.flows?.length ?? 0) + (trash.broadcasts?.length ?? 0)
    : 0;

  const handleUpgrade = async (plan: string) => {
    if (!activeWorkspace) return;
    try {
      await new Promise<void>((res, rej) => {
        if ((window as Window & typeof globalThis & { Razorpay?: unknown }).Razorpay) { res(); return; }
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => res(); s.onerror = () => rej(new Error('Failed to load Razorpay'));
        document.body.appendChild(s);
      });
      const { data: session } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/billing/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan, workspaceId: activeWorkspace.id }),
      });
      if (!res.ok) { toast.error('Payment gateway not configured yet'); return; }
      const { orderId, amount, key } = await res.json();
      const rzp = new (window as Window & typeof globalThis & { Razorpay: new (o: Record<string, unknown>) => { open(): void } }).Razorpay({
        key, amount, currency: 'INR', order_id: orderId,
        name: 'WaBot', description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
        handler: () => { toast.success('Payment successful! Your plan is now active 🚀'); qc.invalidateQueries({ queryKey: ['subscription', activeWorkspace.id] }); },
      });
      rzp.open();
    } catch { toast.error('Payment setup failed'); }
  };

  const webhookUrl = typeof window !== 'undefined' ? `${process.env.NEXT_PUBLIC_API_URL}/webhook/whatsapp` : '';

  const inp = "w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-green-500/40 transition-colors";
  const inpStyle: React.CSSProperties = { background: 'var(--wb-bg)', border: '1px solid var(--wb-border)', color: 'var(--wb-text)' };

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Left sidebar nav */}
        <div className="w-52 shrink-0 p-4 flex flex-col gap-1 border-r" style={{ borderColor: 'var(--wb-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider px-3 mb-2" style={{ color: 'var(--wb-text-3)' }}>Settings</p>
          {SECTIONS.map((sec) => (
            <button key={sec.id} onClick={() => setSection(sec.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
              style={section === sec.id ? { background: 'var(--wb-bg-active)', color: 'var(--wb-accent)', fontWeight: 600 } : { color: 'var(--wb-text-2)' }}
              onMouseEnter={(e) => { if (section !== sec.id) e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
              onMouseLeave={(e) => { if (section !== sec.id) e.currentTarget.style.background = 'transparent'; }}>
              {sec.label}
            </button>
          ))}
          {/* Recently Deleted */}
          <button onClick={() => setSection('trash')}
            className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between"
            style={section === 'trash' ? { background: 'var(--wb-bg-active)', color: 'var(--wb-accent)', fontWeight: 600 } : { color: 'var(--wb-text-2)' }}
            onMouseEnter={(e) => { if (section !== 'trash') e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
            onMouseLeave={(e) => { if (section !== 'trash') e.currentTarget.style.background = 'transparent'; }}>
            <span className="flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5" />Recently Deleted
            </span>
            {trashCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 leading-none">
                {trashCount}
              </span>
            )}
          </button>
          <Divider />
          {/* Appearance */}
          <p className="text-xs font-semibold uppercase tracking-wider px-3 mb-2" style={{ color: 'var(--wb-text-3)' }}>Appearance</p>
          <div className="px-3">
            <div className="flex rounded-lg overflow-hidden p-0.5" style={{ background: 'var(--wb-bg-hover)', gap: '2px' }}>
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button key={t} onClick={() => setTheme(t)}
                  className="flex-1 py-1.5 text-xs font-medium capitalize rounded transition-colors"
                  style={theme === t
                    ? { background: 'var(--wb-accent)', color: '#ffffff' }
                    : { color: 'var(--wb-text-2)' }}>
                  {t === 'system' ? 'Auto' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--wb-text-3)' }}>
              {theme === 'system' ? 'Follows your device theme' : theme === 'dark' ? 'Always dark' : 'Always light'}
            </p>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 overflow-auto p-6 max-w-xl">

          {/* ── Workspace ── */}
          {section === 'workspace' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--wb-text)' }}>Workspace Settings</h2>
                <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>Update your workspace name and business type</p>
              </div>
              <div className="space-y-4">
                <Field label="Workspace Name">
                  <input className={inp} style={inpStyle} placeholder="e.g. Raj's Hotel" value={wsName} onChange={(e) => setWsName(e.target.value)} />
                </Field>
                {activeWorkspace && (
                  <Field label="Workspace ID">
                    <input className={`${inp} font-mono text-xs opacity-50`} style={inpStyle} readOnly value={activeWorkspace.id} />
                  </Field>
                )}
                <Button className="bg-green-600 hover:bg-green-700 text-white h-9 text-sm"
                  onClick={() => saveWorkspaceName.mutate()} disabled={saveWorkspaceName.isPending || !wsName.trim()}>
                  {saveWorkspaceName.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>

              {activeWorkspace && (
                <>
                  <Divider />
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--wb-text)' }}>Business Type</p>
                    <p className="text-xs mb-3" style={{ color: 'var(--wb-text-3)' }}>Your dashboard and flows adapt to your business type</p>
                    <div className="grid grid-cols-3 gap-2">
                      {BUSINESS_TYPES.map((biz) => (
                        <button key={biz.type} onClick={() => { setBusinessType(biz.type); setBtChanged(true); }}
                          className="rounded-lg p-3 text-left border transition-all text-xs"
                          style={businessType === biz.type
                            ? { border: '1px solid var(--wb-accent)', background: 'var(--wb-bg-active)' }
                            : { border: '1px solid var(--wb-border)', background: 'var(--wb-bg)' }}>
                          <span className="text-base block mb-1">{biz.emoji}</span>
                          <p className="font-medium" style={{ color: 'var(--wb-text)' }}>{biz.label}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--wb-text-3)' }}>{biz.subtitle}</p>
                        </button>
                      ))}
                    </div>
                    {btChanged && businessType !== activeWorkspace.business_type && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-600 dark:text-amber-400">Changing business type will update your sidebar and dashboard.</p>
                      </div>
                    )}
                    <Button className="mt-3 bg-green-600 hover:bg-green-700 text-white h-9 text-sm"
                      onClick={() => saveBusinessType.mutate()} disabled={saveBusinessType.isPending || !btChanged || !businessType}>
                      {saveBusinessType.isPending ? 'Saving…' : 'Save Business Type'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── WhatsApp ── */}
          {section === 'whatsapp' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--wb-text)' }}>WhatsApp Connection</h2>
                <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>Connect your Meta WhatsApp Business account</p>
              </div>
              {!activeWorkspace ? (
                <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>Create a workspace first in Workspace Settings.</p>
              ) : (
                <div className="space-y-4">
                  <Field label="Phone Number ID" hint="From Meta Business Manager → WhatsApp Accounts">
                    <input className={inp} style={inpStyle} placeholder="e.g. 123456789012345"
                      value={waForm.wa_phone_number_id} onChange={(e) => setWaForm({ ...waForm, wa_phone_number_id: e.target.value })} />
                  </Field>
                  <Field label="WhatsApp Business Account ID (WABA ID)">
                    <input className={inp} style={inpStyle} placeholder="e.g. 987654321098765"
                      value={waForm.wa_business_id} onChange={(e) => setWaForm({ ...waForm, wa_business_id: e.target.value })} />
                  </Field>
                  <Field label="Display Phone Number">
                    <input className={inp} style={inpStyle} placeholder="+91 99999 99999"
                      value={waForm.wa_phone_number} onChange={(e) => setWaForm({ ...waForm, wa_phone_number: e.target.value })} />
                  </Field>
                  <Field label="Access Token">
                    <input className={inp} style={inpStyle} type="password" placeholder="Permanent or temporary access token"
                      value={waForm.wa_access_token} onChange={(e) => setWaForm({ ...waForm, wa_access_token: e.target.value })} />
                  </Field>
                  <Field label="Webhook URL (copy to Meta)" hint="Set this as your webhook URL in Meta's WhatsApp settings">
                    <input className={`${inp} font-mono text-xs opacity-60`} style={inpStyle} readOnly value={webhookUrl} />
                  </Field>
                  <Button className="bg-green-600 hover:bg-green-700 text-white h-9 text-sm"
                    onClick={() => saveWa.mutate()} disabled={saveWa.isPending}>
                    {saveWa.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── AI ── */}
          {section === 'ai' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--wb-text)' }}>AI Settings</h2>
                <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>Configure the AI smart reply assistant</p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--wb-border)' }}>
                <Toggle enabled={aiEnabled} onChange={setAiEnabled} label="AI Smart Reply"
                  description="Auto-reply when no flow matches the customer's message" />
                <Toggle enabled={langDetect} onChange={setLangDetect} label="Auto Language Detection"
                  description="Default: English — switches to Hindi only on explicit customer request" />
              </div>
              <Field label="AI Response Language">
                <Select value={aiLang} onValueChange={(v) => v && setAiLang(v)} disabled={langDetect}>
                  <SelectTrigger className="text-sm h-9" style={{ background: 'var(--wb-bg)', border: '1px solid var(--wb-border)', color: 'var(--wb-text)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: 'var(--wb-bg-sidebar)', border: '1px solid var(--wb-border)' }}>
                    {AI_LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value} className="text-sm" style={{ color: 'var(--wb-text)' }}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="System Prompt" hint="Tell AI about your business — timings, menu, services, FAQs">
                <textarea rows={5} className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none transition-colors"
                  style={{ ...inpStyle, disabled: !activeWorkspace ? 'true' : undefined } as React.CSSProperties}
                  placeholder="Example: You are an assistant for XYZ Restaurant. We open at 10 AM, close at 10 PM..."
                  value={systemPrompt} disabled={!activeWorkspace}
                  onChange={(e) => setSystemPrompt(e.target.value)} />
              </Field>
              <Button className="bg-green-600 hover:bg-green-700 text-white h-9 text-sm" onClick={saveAiSettings}>
                {aiSaved ? <><Check className="h-3.5 w-3.5 mr-1.5" />Saved</> : 'Save AI Settings'}
              </Button>
            </div>
          )}

          {/* ── Recently Deleted ── */}
          {section === 'trash' && (
            <TrashSection workspaceId={activeWorkspace?.id ?? ''} onRestore={() => qc.invalidateQueries({ queryKey: ['trash', activeWorkspace?.id] })} />
          )}

          {/* ── Billing ── */}
          {section === 'billing' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--wb-text)' }}>Billing & Plans</h2>
                <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>Manage your subscription</p>
              </div>
              {!activeWorkspace ? (
                <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>Create a workspace first.</p>
              ) : (
                <>
                  {/* Current plan */}
                  <div className="rounded-xl p-4" style={{ border: '1px solid var(--wb-border)', background: 'var(--wb-bg-card)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold capitalize text-sm" style={{ color: 'var(--wb-text)' }}>{sub?.plan ?? 'Free Trial'}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                        style={{ background: sub?.status === 'active' ? 'rgba(22,163,74,0.12)' : 'rgba(59,130,246,0.12)', color: sub?.status === 'active' ? '#16a34a' : '#3b82f6' }}>
                        {sub?.status ?? 'trial'}
                      </span>
                    </div>
                    {sub?.trial_ends_at && sub?.status === 'trial' && (
                      <p className="text-xs mt-1" style={{ color: 'var(--wb-text-3)' }}>
                        Trial ends: {new Date(sub.trial_ends_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    {sub?.conversation_count !== undefined && (
                      <p className="text-xs mt-1" style={{ color: 'var(--wb-text-3)' }}>
                        {sub.conversation_count} / {sub.conversation_limit === -1 ? '∞' : sub.conversation_limit} conversations this month
                      </p>
                    )}
                  </div>

                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--wb-text-3)' }}>Upgrade</p>

                  {[
                    { id: 'starter', name: 'Starter', price: '₹999/mo', desc: '1 WhatsApp · 500 conversations · Basic flows + AI' },
                    { id: 'growth',  name: 'Growth ⭐', price: '₹2,499/mo', desc: '1 WhatsApp · 2,000 conversations · Unlimited flows' },
                    { id: 'agency',  name: 'Agency', price: '₹6,999/mo', desc: '5 numbers · Unlimited conversations · Multi-agent' },
                  ].map((plan) => {
                    const isCurrent = sub?.plan === plan.id && sub?.status === 'active';
                    return (
                      <div key={plan.id} className="rounded-xl p-4 flex items-center justify-between"
                        style={{ border: isCurrent ? '1px solid var(--wb-accent)' : '1px solid var(--wb-border)', background: 'var(--wb-bg)' }}>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>
                            {plan.name} <span className="font-normal text-xs" style={{ color: 'var(--wb-text-3)' }}>— {plan.price}</span>
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--wb-text-3)' }}>{plan.desc}</p>
                        </div>
                        <button
                          onClick={() => !isCurrent && handleUpgrade(plan.id)}
                          disabled={isCurrent}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-4"
                          style={isCurrent
                            ? { border: '1px solid var(--wb-border)', color: 'var(--wb-text-3)' }
                            : { background: 'var(--wb-accent)', color: '#fff' }}>
                          {isCurrent ? 'Current' : 'Upgrade'}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
