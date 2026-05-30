'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Power, Trash2, ChevronRight, Zap, AlertCircle, Sparkles,
  Check, Loader2, GitBranch, List, ChevronDown, ChevronUp,
  Edit3, Save, X, Globe, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceStore } from '@/lib/store';
import {
  getFlows, createFlow, updateFlow, deleteFlow, aiGenerateFlows,
  getSmartMenu, saveSmartMenu, patchSmartMenu, deleteSmartMenu,
} from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type StepConfig = Record<string, unknown> & { message?: string; body?: string; buttons?: string[]; stage?: string; template_name?: string; delay_ms?: string };
type Step = { type: string; config: StepConfig };
type Flow = { id: string; name: string; trigger: Record<string, string>; is_active: boolean; created_at: string; flow_steps: Step[] };

interface SmartMenuOption {
  label_en: string; label_hi: string; label_hl: string;
  reply_en: string; reply_hi: string; reply_hl: string;
}
interface SmartMenu {
  id: string; workspace_id: string; business_name: string;
  languages: string[]; options: SmartMenuOption[]; is_active: boolean; created_at: string;
}

type LangKey = 'hindi' | 'english' | 'hinglish';
const LANG_SUFFIX: Record<LangKey, 'hi' | 'en' | 'hl'> = { hindi: 'hi', english: 'en', hinglish: 'hl' };
const LANG_LABELS: Record<LangKey, string> = { hindi: '🇮🇳 Hindi', english: '🇬🇧 English', hinglish: '🔀 Hinglish' };
const LANGS: LangKey[] = ['hindi', 'english', 'hinglish'];

// Category config for AI flow grouping
const CAT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  welcome:  { label: '🎯 Welcome & Greetings',   icon: '🎯', color: 'rgba(234,179,8,0.15)'   },
  language: { label: '🌐 Language Selection',    icon: '🌐', color: 'rgba(59,130,246,0.12)'  },
  menu:     { label: '📋 Main Menu Options',     icon: '📋', color: 'rgba(168,85,247,0.12)'  },
  submenu:  { label: '📁 Sub-menus & Details',   icon: '📁', color: 'rgba(34,197,94,0.12)'   },
  faq:      { label: '❓ FAQ & Info',            icon: '❓', color: 'rgba(249,115,22,0.12)'  },
};

// Default option labels by business type
const BIZ_DEFAULTS: Record<string, { labelEn: string; replyEn: string }[]> = {
  hotel: [
    { labelEn: 'Room Booking',       replyEn: 'For room booking please call +91-XXXXX or visit our website.' },
    { labelEn: 'Check-in / Check-out', replyEn: 'Check-in: 2 PM. Check-out: 12 PM. Please carry valid photo ID.' },
    { labelEn: 'Room Service',       replyEn: 'Room service available 24/7. Dial extension 0 from your room.' },
    { labelEn: 'Location & Contact', replyEn: 'Address: [Your address]. Phone: +91-XXXXX. We\'re happy to help!' },
  ],
  restaurant: [
    { labelEn: 'View Menu',          replyEn: 'Our menu has [dishes]. Reply MENU for the full list or call +91-XXXXX.' },
    { labelEn: 'Book a Table',       replyEn: 'Table booking: call +91-XXXXX or tell us your date, time & guest count.' },
    { labelEn: 'Home Delivery',      replyEn: 'Delivery in 30-45 mins. Min order ₹200. Call +91-XXXXX to order.' },
    { labelEn: 'Timings & Location', replyEn: 'Open 10 AM – 11 PM. Address: [Your address].' },
  ],
  salon: [
    { labelEn: 'Our Services',       replyEn: 'We offer Haircut, Color, Facial, Bridal Makeup & more. Call for pricing!' },
    { labelEn: 'Book Appointment',   replyEn: 'Book now: +91-XXXXX or reply with your preferred date & time.' },
    { labelEn: 'Timings',            replyEn: 'Open Mon-Sun 9 AM – 9 PM. Walk-ins welcome!' },
    { labelEn: 'Location',           replyEn: 'Address: [Your address]. Near [landmark]. Google Maps: [link]' },
  ],
  general: [
    { labelEn: 'Our Services',       replyEn: 'We offer [services]. Contact us for details: +91-XXXXX' },
    { labelEn: 'Pricing',            replyEn: 'Plans start from ₹[amount]. Contact for a custom quote.' },
    { labelEn: 'Contact Us',         replyEn: 'Phone: +91-XXXXX | Email: info@business.com | WhatsApp: +91-XXXXX' },
    { labelEn: 'Hours & Location',   replyEn: 'Open Mon-Sat 9 AM – 6 PM. Address: [Your address].' },
  ],
};

// ── Shared input style ────────────────────────────────────────────────────────

const inp  = 'w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-green-500/40';
const inpS = { background: 'var(--wb-input)', borderColor: 'var(--wb-input-border)', color: 'var(--wb-text)' } as React.CSSProperties;

// ── Manual flow dialog ────────────────────────────────────────────────────────

const STEP_TYPES = [
  { value: 'send_message', label: 'Send Message' },
  { value: 'send_buttons', label: 'Send Buttons' },
  { value: 'on_reply',     label: 'On Reply (branch)' },
  { value: 'send_template', label: 'Send Template' },
  { value: 'wait',         label: 'Wait' },
  { value: 'update_stage', label: 'Update Stage' },
];
const DEFAULT_CONFIG: Record<string, StepConfig> = {
  send_message: { message: '' }, send_buttons: { body: '', buttons: ['','',''] },
  on_reply: { branches: [] }, send_template: { template_name: '' },
  wait: { delay_ms: '0' }, update_stage: { stage: '' },
};

function StepEditor({ step, index, onUpdate, onRemove }: { step: Step; index: number; onUpdate: (s: Step) => void; onRemove: () => void }) {
  return (
    <div className="border border-white/10 rounded-lg p-3 space-y-2 bg-white/3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">Step {index + 1}</span>
        <button onClick={onRemove}><Trash2 className="h-3 w-3 text-red-400" /></button>
      </div>
      <Select value={step.type} onValueChange={(v) => v && onUpdate({ type: v, config: DEFAULT_CONFIG[v] ?? {} })}>
        <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-[#252525] border-white/10 text-white">
          {STEP_TYPES.map((t) => <SelectItem key={t.value} value={t.value} className="hover:bg-white/5 focus:bg-white/5">{t.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {step.type === 'send_message' && (
        <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30" placeholder="Message text"
          value={String(step.config.message ?? '')} onChange={(e) => onUpdate({ ...step, config: { message: e.target.value } })} />
      )}
      {step.type === 'update_stage' && (
        <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30" placeholder="Stage name"
          value={String(step.config.stage ?? '')} onChange={(e) => onUpdate({ ...step, config: { stage: e.target.value } })} />
      )}
    </div>
  );
}

function FlowDialog({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('keyword');
  const [triggerValue, setTriggerValue] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const save = useMutation({
    mutationFn: () => createFlow(workspaceId, { name, trigger: { type: triggerType, keyword: triggerValue, stage: triggerValue }, steps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows', workspaceId] }); toast.success('Flow created'); onClose(); },
    onError: () => toast.error('Failed to create flow'),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#252525] border-white/10 text-white">
        <DialogHeader><DialogTitle className="text-white">New Flow</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30" placeholder="Flow name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">Trigger</p>
            <Select value={triggerType} onValueChange={(v) => v && setTriggerType(v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#252525] border-white/10 text-white">
                {['keyword','new_contact','stage_change'].map((t) => <SelectItem key={t} value={t} className="hover:bg-white/5 focus:bg-white/5">{t.replace('_',' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            {(triggerType === 'keyword' || triggerType === 'stage_change') && (
              <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                placeholder={triggerType === 'keyword' ? 'Keywords, comma-separated' : 'Stage name'}
                value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/70">Steps</p>
              <Button variant="outline" size="sm" onClick={() => setSteps([...steps, { type: 'send_message', config: { message: '' } }])} className="border-white/10 text-white/60 hover:bg-white/5">
                <Plus className="h-3 w-3 mr-1" />Add step
              </Button>
            </div>
            {steps.map((step, i) => (
              <StepEditor key={i} step={step} index={i}
                onUpdate={(s) => setSteps(steps.map((x, idx) => idx === i ? s : x))}
                onRemove={() => setSteps(steps.filter((_, idx) => idx !== i))} />
            ))}
            {steps.length === 0 && <p className="text-xs text-white/30 text-center py-3">No steps yet</p>}
          </div>
          <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}>
            {save.isPending ? 'Creating…' : 'Create Flow'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── AI Generate Modal (with categories + progress) ────────────────────────────

interface AIFlowItem { name: string; trigger: string; message: string; category: string }

function AIGenerateModal({ open, onClose, workspaceId, businessType }: {
  open: boolean; onClose: () => void; workspaceId: string; businessType?: string;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<'input' | 'loading' | 'preview' | 'creating' | 'done'>('input');
  const [aiFlows, setAiFlows] = useState<AIFlowItem[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const handleClose = () => {
    if (step === 'loading' || step === 'creating') return;
    setStep('input'); setDescription(''); setAiFlows([]); setSelected({}); onClose();
  };

  const generate = async () => {
    if (!description.trim()) { toast.error('Please describe your business first'); return; }
    setStep('loading');
    try {
      const result = await aiGenerateFlows(workspaceId, description.trim(), businessType);
      const flows: AIFlowItem[] = result.flows || [];
      if (!flows.length) { toast.error('No flows generated. Try again.'); setStep('input'); return; }
      setAiFlows(flows);
      setSelected(Object.fromEntries(flows.map((_, i) => [i, true])));
      setStep('preview');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error)?.message || 'Generation failed';
      toast.error(msg); setStep('input');
    }
  };

  const createSelected = async () => {
    const toCreate = aiFlows.filter((_, i) => selected[i]);
    if (!toCreate.length) return;
    setProgress({ done: 0, total: toCreate.length });
    setStep('creating');
    let done = 0;
    for (const f of toCreate) {
      try {
        await createFlow(workspaceId, {
          name:    f.name,
          trigger: { type: 'keyword', keyword: f.trigger },
          steps:   [{ type: 'send_message', config: { message: f.message } }],
          is_active: true,
        });
      } catch { /* skip individual failures */ }
      done++;
      setProgress({ done, total: toCreate.length });
    }
    qc.invalidateQueries({ queryKey: ['flows', workspaceId] });
    setStep('done');
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const toggleAll = (val: boolean) => setSelected(Object.fromEntries(aiFlows.map((_, i) => [i, val])));

  // Group by category
  const grouped: Record<string, { index: number; flow: AIFlowItem }[]> = {};
  aiFlows.forEach((f, i) => {
    const cat = f.category || 'faq';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ index: i, flow: f });
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#252525] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-400" />Generate Flows with AI
          </DialogTitle>
        </DialogHeader>

        {/* Input */}
        {step === 'input' && (
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-sm font-medium text-white/80 mb-1.5">Describe your business</p>
              <textarea autoFocus rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: Hotel Grand in Delhi. Check-in 2 PM, checkout 12 PM. Deluxe rooms from ₹3,500/night, Suites ₹7,000. Restaurant open 7 AM-10 PM. Pool, gym, spa. Room service 24/7. Contact: +91-9999999999."
                className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-green-500/50"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }} />
              <p className="text-xs text-white/30 mt-1.5">The more detail you give (prices, timings, phone), the better the flows. AI generates 15-20+ flows automatically.</p>
            </div>
            <Button onClick={generate} disabled={!description.trim()} className="w-full bg-green-600 hover:bg-green-700 text-white h-11 text-sm font-semibold">
              <Sparkles className="h-4 w-4 mr-2" />Generate All Flows
            </Button>
          </div>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div className="relative"><Loader2 className="h-10 w-10 text-green-400 animate-spin" /><Sparkles className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1" /></div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">AI is generating your flows…</p>
              <p className="text-sm text-white/40 mt-1">Creating 15-20+ flows tailored to your business</p>
            </div>
          </div>
        )}

        {/* Preview with categories */}
        {step === 'preview' && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                <span className="text-green-400">{aiFlows.length} flows</span> generated — select which to create
              </p>
              <div className="flex gap-2">
                <button onClick={() => toggleAll(true)}  className="text-xs text-green-400 hover:text-green-300">Select All</button>
                <span className="text-white/20">|</span>
                <button onClick={() => toggleAll(false)} className="text-xs text-white/40 hover:text-white/60">None</button>
                <button onClick={() => setStep('input')} className="text-xs text-white/30 hover:text-white/50 underline ml-2">← Edit</button>
              </div>
            </div>

            {/* Category groups */}
            {Object.entries(CAT_CONFIG).map(([cat, cfg]) => {
              const items = grouped[cat] || [];
              if (!items.length) return null;
              const allSel = items.every((x) => selected[x.index]);
              return (
                <div key={cat} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: cfg.color }}>
                    <span className="text-sm font-semibold text-white">{cfg.label} <span className="text-white/40 font-normal text-xs">({items.length})</span></span>
                    <button onClick={() => {
                      const next = { ...selected };
                      items.forEach((x) => { next[x.index] = !allSel; });
                      setSelected(next);
                    }} className="text-xs text-white/60 hover:text-white">
                      {allSel ? 'Deselect' : 'Select'} all
                    </button>
                  </div>
                  <div className="divide-y divide-white/5">
                    {items.map(({ index, flow }) => (
                      <label key={index} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/3">
                        <input type="checkbox" checked={selected[index] ?? true}
                          onChange={(e) => setSelected({ ...selected, [index]: e.target.checked })}
                          className="mt-0.5 accent-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-white truncate">{flow.name}</span>
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                              {flow.trigger}
                            </span>
                          </div>
                          <p className="text-xs text-white/50 truncate">{flow.message}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={handleClose} className="border-white/10 text-white/60 hover:bg-white/5">Cancel</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
                onClick={createSelected} disabled={selectedCount === 0}>
                <Check className="h-4 w-4 mr-2" />Create {selectedCount} Flow{selectedCount !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* Creating progress */}
        {step === 'creating' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 text-green-400 animate-spin" />
            <div className="text-center">
              <p className="text-base font-semibold text-white">Creating flows…</p>
              <p className="text-2xl font-bold text-green-400 mt-2">{progress.done} / {progress.total}</p>
              <div className="w-48 h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-14 w-14 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="h-7 w-7 text-green-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">✅ {progress.total} flows created successfully!</p>
              <p className="text-sm text-white/40 mt-1">All flows are active. Test them on WhatsApp.</p>
            </div>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Smart Menu Setup Wizard ───────────────────────────────────────────────────

interface SetupFormState {
  businessName: string;
  greetByName: boolean;
  languages: string[];
  options: { labelEn: string; replyEn: string }[];
}

function SmartMenuSetup({ workspaceId, workspaceName, businessType, onSaved }: {
  workspaceId: string; workspaceName: string; businessType?: string; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const bt = businessType || 'general';
  const defaults = BIZ_DEFAULTS[bt] || BIZ_DEFAULTS.general;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<SetupFormState>({
    businessName: workspaceName,
    greetByName:  true,
    languages:    ['hindi', 'english', 'hinglish'],
    options:      defaults.map((d) => ({ labelEn: d.labelEn, replyEn: d.replyEn })),
  });

  const save = useMutation({
    mutationFn: () => saveSmartMenu(workspaceId, {
      business_name: form.businessName.trim(),
      languages:     form.languages,
      options:       form.options.map((o) => ({
        label_en: o.labelEn, label_hi: '', label_hl: '',
        reply_en: o.replyEn, reply_hi: '', reply_hl: '',
      })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['smart-menu', workspaceId] }); toast.success('Smart Menu activated! 🎉'); onSaved(); },
    onError: (e: Error) => toast.error(e.message || 'Failed to save'),
  });

  const toggleLang = (l: string) =>
    setForm({ ...form, languages: form.languages.includes(l) ? form.languages.filter((x) => x !== l) : [...form.languages, l] });

  return (
    <div className="rounded-2xl p-6 space-y-5"
      style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-2">
        {([1,2,3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s ? 'bg-green-600 text-white' : 'bg-white/10 text-white/40'}`}>{s}</div>
            {s < 3 && <div className={`h-px w-8 ${step > s ? 'bg-green-500' : 'bg-white/10'}`} />}
          </div>
        ))}
        <span className="text-xs text-white/40 ml-2">
          {step === 1 ? 'Business Info' : step === 2 ? 'Menu Options' : 'Reply Messages'}
        </span>
      </div>

      {/* Step 1: Business info */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>Business Name</label>
            <input className={inp} style={inpS} value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="e.g. Hotel Grand" />
          </div>
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--wb-text-2)' }}>Greeting Style</label>
            <div className="flex gap-3">
              {[{v:true,l:'By Name 👤'},{v:false,l:'Generic 👋'}].map(({v,l}) => (
                <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.greetByName === v} onChange={() => setForm({ ...form, greetByName: v })} className="accent-green-500" />
                  <span className="text-sm" style={{ color: 'var(--wb-text)' }}>{l}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--wb-text-2)' }}>Languages</label>
            <div className="flex gap-3 flex-wrap">
              {LANGS.map((l) => (
                <label key={l} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.languages.includes(l)} onChange={() => toggleLang(l)} className="accent-green-500" />
                  <span className="text-sm" style={{ color: 'var(--wb-text)' }}>{LANG_LABELS[l]}</span>
                </label>
              ))}
            </div>
          </div>
          <Button className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setStep(2)} disabled={!form.businessName.trim() || !form.languages.length}>
            Next →
          </Button>
        </div>
      )}

      {/* Step 2: Option labels — dynamic, 2-9 options */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>
              Edit the menu option labels customers will see ({form.options.length}/9)
            </p>
          </div>
          {form.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs shrink-0 w-5 text-center" style={{ color: 'var(--wb-text-3)' }}>{i + 1}</span>
              <input className={`${inp} flex-1`} style={inpS} value={opt.labelEn}
                onChange={(e) => {
                  const opts = [...form.options];
                  opts[i] = { ...opts[i], labelEn: e.target.value };
                  setForm({ ...form, options: opts });
                }} placeholder={`Option ${i + 1} label`} />
              <button
                disabled={form.options.length <= 2}
                onClick={() => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })}
                className="shrink-0 p-1.5 rounded hover:bg-red-500/10 transition-colors disabled:opacity-30"
                style={{ color: 'var(--wb-text-3)' }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {form.options.length < 9 && (
            <button
              onClick={() => setForm({ ...form, options: [...form.options, { labelEn: '', replyEn: '' }] })}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors w-full"
              style={{ color: 'var(--wb-accent)', border: '1px dashed var(--wb-accent)', background: 'var(--wb-bg-active)' }}>
              <Plus className="h-3.5 w-3.5" />Add Option
            </button>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setStep(1)} className="border-white/10 text-white/60 hover:bg-white/5 flex-1">← Back</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setStep(3)}
              disabled={form.options.some((o) => !o.labelEn.trim())}>
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Reply messages — one per option, dynamic count */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>
            What should the bot reply for each of your {form.options.length} options?
          </p>
          {form.options.map((opt, i) => (
            <div key={i}>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>
                {i + 1}️⃣ {opt.labelEn || `Option ${i + 1}`}
              </label>
              <textarea rows={2} className={`${inp} resize-none`} style={inpS} value={opt.replyEn}
                onChange={(e) => {
                  const opts = [...form.options];
                  opts[i] = { ...opts[i], replyEn: e.target.value };
                  setForm({ ...form, options: opts });
                }} placeholder="Short reply shown to customer (2-3 lines max)" />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="border-white/10 text-white/60 hover:bg-white/5 flex-1">← Back</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : <><Check className="h-4 w-4 mr-1.5" />Save & Activate</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Smart Menu Tree View ──────────────────────────────────────────────────────

function SmartMenuTree({ smartMenu, workspaceId }: { smartMenu: SmartMenu; workspaceId: string }) {
  const qc = useQueryClient();
  const [activeLang, setActiveLang] = useState<LangKey>('english');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<SmartMenuOption>>({});

  const sfx = LANG_SUFFIX[activeLang];
  const activeLangs = (smartMenu.languages || ['english']) as LangKey[];

  const deactivate = useMutation({
    mutationFn: () => deleteSmartMenu(workspaceId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['smart-menu', workspaceId] }); toast.success('Smart Menu removed'); },
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (editingIdx === null) return;
      const options = smartMenu.options.map((o, i) => i === editingIdx ? { ...o, ...editValues } : o);
      return patchSmartMenu(workspaceId, { options });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['smart-menu', workspaceId] }); setEditingIdx(null); toast.success('Reply updated'); },
  });

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditValues({
      [`reply_${sfx}`]: smartMenu.options[i]?.[`reply_${sfx}`] || smartMenu.options[i]?.reply_en || '',
    });
  };

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl px-4 py-3"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-green-400">Smart Menu is ACTIVE</span>
          <span className="text-xs text-white/30">· {smartMenu.business_name}</span>
        </div>
        <button onClick={() => deactivate.mutate()} disabled={deactivate.isPending}
          className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
          <Trash2 className="h-3 w-3" />Remove
        </button>
      </div>

      {/* Level 0: Welcome */}
      <div className="rounded-xl p-4" style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">👋</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>Welcome &amp; Language</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--wb-bg-hover)', color: 'var(--wb-text-3)' }}>
            trigger: hi / hello / hey / namaste
          </span>
        </div>
        <div className="rounded-lg px-3 py-2.5 text-xs leading-relaxed whitespace-pre-line"
          style={{ background: 'var(--wb-bg-hover)', color: 'var(--wb-text-2)' }}>
          {`Good [Morning/Afternoon/Evening] [Name]! 👋\nWelcome to ${smartMenu.business_name}!\n\n${(smartMenu.languages || []).map((l, i) => `${i+1}️⃣ ${l.charAt(0).toUpperCase() + l.slice(1)}`).join('\n')}`}
        </div>
      </div>

      {/* Language tabs */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--wb-bg-hover)' }}>
        {LANGS.filter((l) => activeLangs.includes(l)).map((l) => (
          <button key={l} onClick={() => setActiveLang(l)}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${activeLang === l ? 'bg-green-600 text-white' : ''}`}
            style={activeLang !== l ? { color: 'var(--wb-text-3)' } : {}}>
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>

      {/* Main menu for active language */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--wb-border)' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'var(--wb-bg-card)', borderBottom: '1px solid var(--wb-border)' }}>
          <span className="text-base">📋</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>Main Menu ({LANG_LABELS[activeLang]})</span>
        </div>

        {/* Preview the main menu message */}
        <div className="px-4 py-3" style={{ background: 'var(--wb-bg-hover)', borderBottom: '1px solid var(--wb-border)' }}>
          <p className="text-xs font-mono leading-relaxed whitespace-pre-line" style={{ color: 'var(--wb-text-2)' }}>
            {activeLang === 'hindi'    ? 'आप क्या चाहते हैं? 😊' :
             activeLang === 'hinglish' ? 'Aap kya chahte hain? 😊' :
                                        'How can we help you? 😊'}
            {'\n\n'}
            {smartMenu.options.map((o, i) => `${i+1}️⃣ ${o[`label_${sfx}`] || o.label_en || `Option ${i+1}`}`).join('\n')}
            {'\n\n0️⃣ Change language'}
          </p>
        </div>

        {/* Option rows */}
        <div className="divide-y" style={{ borderColor: 'var(--wb-border)' }}>
          {smartMenu.options.map((opt, i) => {
            const label = opt[`label_${sfx}`] || opt.label_en || `Option ${i+1}`;
            const reply = opt[`reply_${sfx}`] || opt.reply_en || '';
            const isEditing = editingIdx === i;

            return (
              <div key={i} className="px-4 py-3" style={{ background: 'var(--wb-bg-card)' }}>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>
                    {i+1}️⃣
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--wb-text)' }}>{label}</p>
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea rows={2} className={`${inp} resize-none text-xs`} style={inpS}
                          value={String(editValues[`reply_${sfx}`] || '')}
                          onChange={(e) => setEditValues({ [`reply_${sfx}`]: e.target.value })} />
                        <div className="flex gap-1.5">
                          <Button size="xs" className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 h-6"
                            onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
                            {saveEdit.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Save className="h-3 w-3 mr-1" />Save</>}
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => setEditingIdx(null)}
                            className="border-white/10 text-white/60 hover:bg-white/5 text-xs px-2 h-6">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="text-xs flex-1" style={{ color: 'var(--wb-text-3)' }}>
                          {reply || <em className="opacity-50">No reply set</em>}
                        </p>
                        <button onClick={() => startEdit(i)}
                          className="shrink-0 p-1 rounded hover:bg-white/5 transition-colors"
                          style={{ color: 'var(--wb-text-3)' }}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', color: '#60a5fa' }}>
        <strong>Flow:</strong> Customer sends &quot;hi&quot; → language picker → main menu → picks 1-4 → reply shown. Type &quot;0&quot; or &quot;menu&quot; to go back.
      </div>
    </div>
  );
}

// ── Smart Menu Tab ─────────────────────────────────────────────────────────────

function SmartMenuTab({ workspaceId, workspaceName, businessType }: {
  workspaceId: string; workspaceName: string; businessType?: string;
}) {
  const [showSetup, setShowSetup] = useState(false);

  const { data: smartMenu, isLoading } = useQuery<SmartMenu | null>({
    queryKey: ['smart-menu', workspaceId],
    queryFn: () => getSmartMenu(workspaceId),
    enabled: !!workspaceId,
  });

  if (isLoading) return (
    <div className="space-y-3 mt-4">{[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--wb-bg-card)' }} />)}</div>
  );

  if (!smartMenu && !showSetup) return (
    <div className="mt-4 flex flex-col items-center justify-center py-16 gap-5 rounded-2xl"
      style={{ border: '1px dashed var(--wb-border)' }}>
      <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-3xl"
        style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>🤖</div>
      <div className="text-center max-w-sm">
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--wb-text)' }}>Smart Multi-Level Menu</h3>
        <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>
          Set up an intelligent chatbot that greets customers by name, lets them pick their language, and guides them through your options.
        </p>
      </div>
      <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowSetup(true)}>
        <Zap className="h-4 w-4 mr-2" />Setup Smart Menu
      </Button>
    </div>
  );

  if (!smartMenu && showSetup) return (
    <div className="mt-4">
      <button onClick={() => setShowSetup(false)} className="text-xs mb-3 flex items-center gap-1" style={{ color: 'var(--wb-text-3)' }}>
        ← Cancel setup
      </button>
      <SmartMenuSetup
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        businessType={businessType}
        onSaved={() => setShowSetup(false)}
      />
    </div>
  );

  return (
    <div className="mt-4">
      <SmartMenuTree smartMenu={smartMenu!} workspaceId={workspaceId} />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'smart' | 'manual'>('smart');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const { data: flows = [], isLoading } = useQuery<Flow[]>({
    queryKey: ['flows', activeWorkspace?.id],
    queryFn: () => getFlows(activeWorkspace!.id),
    enabled: !!activeWorkspace && tab === 'manual',
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateFlow(activeWorkspace!.id, id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFlow(activeWorkspace!.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] }); toast.success('Flow deleted'); },
  });

  return (
    <AppShell>
      <div className="p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--wb-text)' }}>Flows</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--wb-text-3)' }}>Automate your WhatsApp conversations</p>
          </div>
          {tab === 'manual' && (
            <div className="flex gap-2">
              <Button size="sm"
                style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}
                onClick={() => {
                  if (!activeWorkspace) { toast.error('Create a workspace first'); return; }
                  setAiModalOpen(true);
                }}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate with AI
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  if (!activeWorkspace) { toast.error('Create a workspace first'); return; }
                  setDialogOpen(true);
                }}>
                <Plus className="h-4 w-4 mr-1" />New Flow
              </Button>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-5 rounded-xl p-1 w-fit"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {([
            { key: 'smart',  icon: <GitBranch className="h-3.5 w-3.5" />, label: 'Smart Menu' },
            { key: 'manual', icon: <List      className="h-3.5 w-3.5" />, label: 'Manual Flows' },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {!activeWorkspace && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />No workspace.{' '}
            <Link href="/settings" className="underline">Go to Settings.</Link>
          </div>
        )}

        {/* Smart Menu tab */}
        {tab === 'smart' && activeWorkspace && (
          <SmartMenuTab
            workspaceId={activeWorkspace.id}
            workspaceName={activeWorkspace.name || ''}
            businessType={activeWorkspace.business_type ?? undefined}
          />
        )}

        {/* Manual Flows tab */}
        {tab === 'manual' && (
          isLoading ? <div className="text-center py-16 text-white/30">Loading…</div>
          : flows.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Zap className="h-10 w-10 mx-auto mb-3 text-white/10" />
              <p className="mb-4">No flows yet. Create manually or generate with AI.</p>
              <Button size="sm"
                style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}
                onClick={() => { if (activeWorkspace) setAiModalOpen(true); }}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate with AI
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {flows.map((flow) => (
                <Card key={flow.id} className="bg-white/5 border-white/8 hover:bg-white/8 transition-colors cursor-pointer group">
                  <Link href={`/flows/${flow.id}`} className="block">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base text-white group-hover:text-green-400 transition-colors">{flow.name}</CardTitle>
                        <Badge className={flow.is_active ? 'bg-green-500/20 text-green-400 border-0' : 'bg-white/5 text-white/40 border-0'}>
                          {flow.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="flex items-center gap-1 text-sm text-white/40 mb-3">
                        <Zap className="h-3 w-3" />
                        <span>Trigger: {flow.trigger?.type ?? '—'}</span>
                        {flow.trigger?.keyword && (
                          <><ChevronRight className="h-3 w-3" /><span className="font-mono text-white/60 truncate max-w-[120px]">{flow.trigger.keyword}</span></>
                        )}
                      </div>
                      <p className="text-xs text-white/30">{flow.flow_steps?.length ?? 0} steps · {timeAgo(flow.created_at)}</p>
                    </CardContent>
                  </Link>
                  <CardContent className="pt-0 pb-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 border-white/10 text-white/60 hover:bg-white/5"
                        onClick={(e) => { e.stopPropagation(); toggle.mutate({ id: flow.id, is_active: !flow.is_active }); }}>
                        <Power className="h-3 w-3 mr-1" />{flow.is_active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button variant="outline" size="sm" className="border-white/10 hover:bg-red-500/10"
                        onClick={(e) => { e.stopPropagation(); remove.mutate(flow.id); }}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      <FlowDialog open={dialogOpen} onClose={() => setDialogOpen(false)} workspaceId={activeWorkspace?.id ?? ''} />
      <AIGenerateModal open={aiModalOpen} onClose={() => setAiModalOpen(false)}
        workspaceId={activeWorkspace?.id ?? ''} businessType={activeWorkspace?.business_type ?? undefined} />
    </AppShell>
  );
}
