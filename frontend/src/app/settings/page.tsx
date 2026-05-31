'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, AlertTriangle, Trash2, RotateCcw, Palette, Lock, ShieldCheck, Upload, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceStore } from '@/lib/store';
import { createWorkspace, updateWorkspace, getSubscription, createSubscription, getTrash, restoreTrashItem, permanentDeleteTrashItem, getWAProfile, updateWAProfile, uploadWAProfilePhoto } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { BUSINESS_TYPES, type BusinessType } from '@/lib/businessConfig';
import { useTheme, useAccent, type AccentKey, ACCENT_DEFS, type Theme } from '@/app/providers';
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
                  style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>
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

// ── Admin credentials ─────────────────────────────────────────────────────────
const CRED_USER = 'system';
const CRED_PASS = 'manager';
const ADMIN_EMAIL_SETTINGS = 'gnnimawat4@gmail.com';
const PROTECTED_SECTIONS: Section[] = ['workspace', 'whatsapp', 'billing'];

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
  const { accent, setAccent } = useAccent();
  const [section, setSection] = useState<Section>('workspace');

  // ── Admin gate ──────────────────────────────────────────────────────────────
  const [userEmail, setUserEmail] = useState('');
  const [pendingSection, setPendingSection] = useState<Section | null>(null);
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');
  const [credError, setCredError] = useState('');

  const isAdminUser = userEmail === ADMIN_EMAIL_SETTINGS;

  const [wsName, setWsName] = useState('');
  const [waForm, setWaForm] = useState({ wa_phone_number_id: '', wa_phone_number: '', wa_access_token: '', wa_business_id: '' });
  const [profileForm, setProfileForm] = useState({ about: '', description: '', email: '', website: '', vertical: '' });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [btChanged, setBtChanged] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [langDetect, setLangDetect] = useState(false);
  const [aiLang, setAiLang] = useState('auto');
  const [aiSaved, setAiSaved] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email || '');
    });
  }, []);

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
      const ws = activeWorkspace as unknown as Record<string, string | null>;
      setProfileForm({
        about:       ws.wa_about                ?? '',
        description: ws.wa_business_description ?? '',
        email:       ws.wa_business_email       ?? '',
        website:     ws.wa_business_website     ?? '',
        vertical:    ws.wa_business_vertical    ?? '',
      });
      setPhotoPreview(ws.wa_profile_photo_url ?? null);
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

  const syncProfile = useMutation({
    mutationFn: () => getWAProfile(activeWorkspace!.id),
    onSuccess: (data) => {
      setProfileForm({
        about:       data.about       ?? '',
        description: data.description ?? '',
        email:       data.email       ?? '',
        website:     (data.websites || [])[0] ?? '',
        vertical:    data.vertical    ?? '',
      });
      if (data.profile_picture_url) setPhotoPreview(data.profile_picture_url);
      toast.success('Profile synced from WhatsApp');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to sync profile'),
  });

  const saveProfile = useMutation({
    mutationFn: () => updateWAProfile(activeWorkspace!.id, profileForm),
    onSuccess: () => toast.success('Business profile updated! Changes visible in 5–10 minutes.'),
    onError: (e: Error) => toast.error(e.message || 'Failed to update profile'),
  });

  const uploadPhoto = useMutation({
    mutationFn: () => uploadWAProfilePhoto(activeWorkspace!.id, photoFile!),
    onSuccess: (data) => {
      if (data.photo_url) setPhotoPreview(data.photo_url);
      setPhotoFile(null);
      toast.success('Profile photo updated! Changes visible in 5–10 minutes.');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to upload photo'),
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

  const isTrial = sub?.status === 'trial' && !isAdminUser;

  const handleSectionClick = (target: Section) => {
    // Admin bypasses the gate; unprotected sections open freely
    if (isAdminUser || !PROTECTED_SECTIONS.includes(target)) {
      setSection(target);
      return;
    }
    // Always ask — no caching
    setCredUser('');
    setCredPass('');
    setCredError('');
    setPendingSection(target);
  };

  const handleCredUnlock = () => {
    if (credUser.trim() === CRED_USER && credPass === CRED_PASS) {
      setSection(pendingSection!);
      setPendingSection(null);
    } else {
      setCredError('Invalid credentials');
    }
  };

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

  const handlePhotoChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Only image files are allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const WA_VERTICALS = [
    { value: 'HOTEL',                label: 'Hotel' },
    { value: 'RESTAURANT',           label: 'Restaurant / Cafe' },
    { value: 'EDUCATION',            label: 'Education' },
    { value: 'ENTERTAINMENT',        label: 'Entertainment' },
    { value: 'FINANCE',              label: 'Finance' },
    { value: 'GROCERY',              label: 'Grocery' },
    { value: 'HEALTH',               label: 'Health / Medical' },
    { value: 'NONPROFIT',            label: 'Non-profit' },
    { value: 'PROFESSIONAL_SERVICES', label: 'Professional Services' },
    { value: 'SHOPPING',             label: 'Shopping / Retail' },
    { value: 'TRAVEL',               label: 'Travel' },
    { value: 'OTHER',                label: 'Other' },
  ];

  const webhookUrl = typeof window !== 'undefined' ? `${process.env.NEXT_PUBLIC_API_URL}/webhook/whatsapp` : '';

  const inp = "w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-green-500/40 transition-colors";
  const inpStyle: React.CSSProperties = { background: 'var(--wb-input)', border: '1px solid var(--wb-input-border)', color: 'var(--wb-text)' };

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Left sidebar nav */}
        <div className="w-52 shrink-0 p-4 flex flex-col gap-1 border-r" style={{ borderColor: 'var(--wb-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider px-3 mb-2" style={{ color: 'var(--wb-text-3)' }}>Settings</p>
          {SECTIONS.map((sec) => (
            <button key={sec.id} onClick={() => handleSectionClick(sec.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between"
              style={section === sec.id ? { background: 'var(--wb-bg-active)', color: 'var(--wb-accent)', fontWeight: 600 } : { color: 'var(--wb-text-2)' }}
              onMouseEnter={(e) => { if (section !== sec.id) e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
              onMouseLeave={(e) => { if (section !== sec.id) e.currentTarget.style.background = 'transparent'; }}>
              <span>{sec.label}</span>
              {PROTECTED_SECTIONS.includes(sec.id) && !isAdminUser && (
                <Lock className="h-3 w-3 opacity-40 shrink-0" />
              )}
            </button>
          ))}
          {/* Recently Deleted */}
          <button onClick={() => handleSectionClick('trash')}
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
                    ? { background: 'var(--wb-accent)', color: 'var(--wb-accent-text)', fontWeight: 600 }
                    : { background: 'transparent', color: 'var(--wb-text-2)' }}>
                  {t === 'system' ? 'Auto' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--wb-text-3)' }}>
              {theme === 'system' ? 'Follows your device theme' : theme === 'dark' ? 'Always dark' : 'Always light'}
            </p>
          </div>

          {/* Accent color */}
          <Divider />
          <div className="px-1">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Palette className="h-3 w-3" style={{ color: 'var(--wb-text-3)' }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--wb-text-3)' }}>Accent Color</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Red */}
              {(['red', 'green', 'neutral'] as AccentKey[]).map((key) => {
                const isSelected = accent === key;
                return (
                  <button
                    key={key}
                    onClick={() => setAccent(key)}
                    title={ACCENT_DEFS[key].label}
                    className="relative h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 overflow-hidden"
                    style={{
                      outline: isSelected ? '2px solid var(--wb-text)' : '2px solid var(--wb-border)',
                      outlineOffset: '2px',
                    }}
                  >
                    {key === 'neutral' ? (
                      <>
                        <span className="absolute inset-0" style={{ background: '#111111', clipPath: 'polygon(0 0,50% 0,50% 100%,0 100%)' }} />
                        <span className="absolute inset-0" style={{ background: '#ffffff', clipPath: 'polygon(50% 0,100% 0,100% 100%,50% 100%)' }} />
                        {isSelected && <Check className="h-3 w-3 relative z-10 text-gray-500" />}
                      </>
                    ) : (
                      <>
                        <span className="absolute inset-0" style={{ background: ACCENT_DEFS[key].accent }} />
                        {isSelected && <Check className="h-3 w-3 relative z-10 text-white" />}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
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
              {isTrial && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <Lock className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">Upgrade your plan to edit workspace settings</p>
                </div>
              )}
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
                  style={{ color: '#ffffff' }}
                  onClick={() => saveWorkspaceName.mutate()} disabled={saveWorkspaceName.isPending || !wsName.trim() || isTrial}>
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
                      style={{ color: '#ffffff' }}
                      onClick={() => saveBusinessType.mutate()} disabled={saveBusinessType.isPending || !btChanged || !businessType || isTrial}>
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
                <>
                  {/* ── API credentials ── */}
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
                      style={{ color: '#ffffff' }}
                      onClick={() => saveWa.mutate()} disabled={saveWa.isPending}>
                      {saveWa.isPending ? 'Saving…' : 'Save WhatsApp'}
                    </Button>
                  </div>

                  <Divider />

                  {/* ── Business Profile ── */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>WhatsApp Business Profile</h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--wb-text-3)' }}>What customers see when they open your chat</p>
                      </div>
                      <button
                        onClick={() => syncProfile.mutate()}
                        disabled={!waForm.wa_phone_number_id || !waForm.wa_access_token || syncProfile.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                        style={{ background: 'var(--wb-bg-hover)', color: 'var(--wb-text-2)', border: '1px solid var(--wb-border)' }}>
                        <RefreshCw className={`h-3 w-3 ${syncProfile.isPending ? 'animate-spin' : ''}`} />
                        {syncProfile.isPending ? 'Syncing…' : 'Sync from WhatsApp'}
                      </button>
                    </div>

                    <div className="flex gap-6">
                      {/* Left: form */}
                      <div className="flex-1 space-y-4">
                        {/* Photo upload */}
                        <div>
                          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--wb-text-2)' }}>Profile Photo</label>
                          <div className="flex items-center gap-4">
                            {/* Circular preview */}
                            <div
                              className="h-20 w-20 rounded-full shrink-0 flex items-center justify-center overflow-hidden cursor-pointer border-2 relative group"
                              style={{ borderColor: 'var(--wb-accent)', background: 'var(--wb-bg-hover)' }}
                              onClick={() => fileInputRef.current?.click()}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); handlePhotoChange(e.dataTransfer.files[0] ?? null); }}
                            >
                              {photoPreview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                              ) : (
                                <Upload className="h-6 w-6 opacity-30" style={{ color: 'var(--wb-text)' }} />
                              )}
                              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Upload className="h-5 w-5 text-white" />
                              </div>
                            </div>

                            <div className="flex-1">
                              <p className="text-xs mb-2" style={{ color: 'var(--wb-text-3)' }}>
                                JPEG or PNG · max 5 MB · auto-cropped to 640×640
                              </p>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => fileInputRef.current?.click()}
                                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                                  style={{ background: 'var(--wb-bg-hover)', color: 'var(--wb-text-2)', border: '1px solid var(--wb-border)' }}>
                                  Choose photo
                                </button>
                                {photoFile && (
                                  <Button
                                    className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                    style={{ color: '#fff' }}
                                    onClick={() => uploadPhoto.mutate()}
                                    disabled={uploadPhoto.isPending}>
                                    {uploadPhoto.isPending ? 'Uploading…' : 'Save Photo'}
                                  </Button>
                                )}
                              </div>
                              {photoFile && (
                                <p className="text-[10px] mt-1.5" style={{ color: '#f59e0b' }}>
                                  Unsaved — click "Save Photo" to apply
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* About */}
                        <Field label="About" hint="Shown below your business name on WhatsApp (max 139 chars)">
                          <div className="relative">
                            <input
                              className={inp} style={inpStyle}
                              maxLength={139}
                              placeholder="e.g. Premium hotel in Dharamshala. Best views, best service 🏔️"
                              value={profileForm.about}
                              onChange={(e) => setProfileForm({ ...profileForm, about: e.target.value })}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--wb-text-3)' }}>
                              {profileForm.about.length}/139
                            </span>
                          </div>
                        </Field>

                        {/* Description */}
                        <Field label="Business Description" hint="Max 256 characters">
                          <div className="relative">
                            <textarea
                              className={`${inp} resize-none`} style={inpStyle}
                              rows={3} maxLength={256}
                              placeholder="Describe your business to customers…"
                              value={profileForm.description}
                              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                            />
                            <span className="absolute right-2 bottom-2 text-[10px]" style={{ color: 'var(--wb-text-3)' }}>
                              {profileForm.description.length}/256
                            </span>
                          </div>
                        </Field>

                        {/* Email */}
                        <Field label="Business Email">
                          <input className={inp} style={inpStyle} type="email"
                            placeholder="contact@yourbusiness.com"
                            value={profileForm.email}
                            onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                        </Field>

                        {/* Website */}
                        <Field label="Website URL">
                          <input className={inp} style={inpStyle} type="url"
                            placeholder="https://yourbusiness.com"
                            value={profileForm.website}
                            onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })} />
                        </Field>

                        {/* Category / Vertical */}
                        <Field label="Business Category">
                          <select
                            className={inp} style={inpStyle}
                            value={profileForm.vertical}
                            onChange={(e) => setProfileForm({ ...profileForm, vertical: e.target.value })}>
                            <option value="">— Select category —</option>
                            {WA_VERTICALS.map((v) => (
                              <option key={v.value} value={v.value}>{v.label}</option>
                            ))}
                          </select>
                        </Field>

                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white h-9 text-sm"
                          style={{ color: '#ffffff' }}
                          onClick={() => saveProfile.mutate()}
                          disabled={saveProfile.isPending || !waForm.wa_phone_number_id || !waForm.wa_access_token}>
                          {saveProfile.isPending ? 'Saving…' : 'Save Profile'}
                        </Button>
                      </div>

                      {/* Right: live preview */}
                      <div className="w-48 shrink-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--wb-text-3)' }}>
                          Preview
                        </p>
                        <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: '#128C7E', border: '1px solid var(--wb-border)' }}>
                          {/* Fake WhatsApp header */}
                          <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: '#075E54' }}>
                            <div className="h-8 w-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ background: '#25D366' }}>
                              {photoPreview
                                ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                                : <span className="text-white text-xs font-bold">
                                    {(waForm.wa_phone_number || 'B').slice(0, 1)}
                                  </span>
                              }
                            </div>
                            <div className="min-w-0">
                              <p className="text-white text-xs font-semibold truncate">
                                {waForm.wa_phone_number || 'Your Business'}
                              </p>
                              {profileForm.vertical && (
                                <p className="text-green-200 text-[9px] truncate">
                                  {WA_VERTICALS.find((v) => v.value === profileForm.vertical)?.label}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* Fake chat bubble */}
                          <div className="px-3 py-3" style={{ background: '#ECE5DD' }}>
                            {profileForm.about && (
                              <p className="text-[10px] italic text-gray-600 mb-2 leading-tight">"{profileForm.about}"</p>
                            )}
                            <div className="rounded-lg px-2 py-1.5 max-w-[90%] ml-auto" style={{ background: '#DCF8C6' }}>
                              <p className="text-[10px] text-gray-700">Hello! How can I help you?</p>
                              <p className="text-[8px] text-gray-400 text-right mt-0.5">10:32 AM ✓✓</p>
                            </div>
                          </div>
                        </div>
                        <p className="text-[9px] mt-2 text-center" style={{ color: 'var(--wb-text-3)' }}>
                          How customers see your profile
                        </p>
                      </div>
                    </div>
                  </div>
                </>
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
              <Button className="bg-green-600 hover:bg-green-700 text-white h-9 text-sm" style={{ color: '#ffffff' }} onClick={saveAiSettings}>
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
                        style={{ background: sub?.status === 'active' ? 'var(--wb-bg-active)' : 'rgba(59,130,246,0.12)', color: sub?.status === 'active' ? 'var(--wb-accent)' : '#3b82f6' }}>
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
                            ? { border: '1px solid var(--wb-border)', color: 'var(--wb-text-2)' }
                            : { background: 'var(--wb-accent)', color: 'var(--wb-accent-text)' }}>
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

      {/* ── Admin credentials modal ─────────────────────────────────────────── */}
      {pendingSection && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setPendingSection(null)}>
          <div className="rounded-xl p-6 max-w-sm w-full shadow-2xl"
            style={{ background: 'var(--wb-bg-sidebar)', border: '1px solid var(--wb-border)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--wb-bg-active)' }}>
                <ShieldCheck className="h-4 w-4" style={{ color: 'var(--wb-accent)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>Admin Access Required</p>
                <p className="text-xs" style={{ color: 'var(--wb-text-3)' }}>Enter credentials to continue</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <input
                className={inp} style={inpStyle}
                placeholder="Username"
                value={credUser}
                autoFocus
                onChange={(e) => { setCredUser(e.target.value); setCredError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCredUnlock()}
              />
              <input
                className={inp} style={inpStyle}
                type="password"
                placeholder="Password"
                value={credPass}
                onChange={(e) => { setCredPass(e.target.value); setCredError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCredUnlock()}
              />
              {credError && <p className="text-xs text-red-400">{credError}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingSection(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ border: '1px solid var(--wb-border)', color: 'var(--wb-text-2)' }}>
                Cancel
              </button>
              <button onClick={handleCredUnlock}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors text-white"
                style={{ background: 'var(--wb-accent)', color: 'var(--wb-accent-text)' }}>
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
