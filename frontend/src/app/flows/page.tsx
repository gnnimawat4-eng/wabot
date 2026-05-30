'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Power, Trash2, ChevronRight, Zap, AlertCircle, Sparkles,
  Check, Loader2, Globe, MessageSquare, ChevronDown, ChevronUp,
  Languages, List, GitBranch, Edit3,
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
  getSmartMenu, updateSmartMenu, aiGenerateSmartMenu,
} from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type Branch = { match: string; message: string };
type StepConfig = Record<string, unknown> & {
  message?: string; body?: string; buttons?: string[];
  branches?: Branch[]; delay_ms?: string; stage?: string; template_name?: string;
};
type Step = { type: string; config: StepConfig };
type Flow = { id: string; name: string; trigger: Record<string, string>; is_active: boolean; created_at: string; flow_steps: Step[] };

interface AIResult { created: number; flows: { id: string; name: string; trigger: string }[] }

type LangKey = 'hindi' | 'english' | 'hinglish';
const LANGS: { key: LangKey; label: string; flag: string }[] = [
  { key: 'hindi',    label: 'Hindi',    flag: '🇮🇳' },
  { key: 'english',  label: 'English',  flag: '🇬🇧' },
  { key: 'hinglish', label: 'Hinglish', flag: '🔀' },
];

// ── Manual flow components (existing) ────────────────────────────────────────

const STEP_TYPES = [
  { value: 'send_message', label: 'Send Message' },
  { value: 'send_buttons', label: 'Send Buttons' },
  { value: 'on_reply',     label: 'On Reply (branch)' },
  { value: 'send_template', label: 'Send Template' },
  { value: 'wait',         label: 'Wait' },
  { value: 'update_stage', label: 'Update Stage' },
];
const TRIGGER_TYPES = ['keyword', 'new_contact', 'stage_change'];
const DEFAULT_CONFIG: Record<string, StepConfig> = {
  send_message:  { message: '' },
  send_buttons:  { body: '', buttons: ['', '', ''] },
  on_reply:      { branches: Array.from({ length: 3 }, () => ({ match: '', message: '' })) },
  send_template: { template_name: '' },
  wait:          { delay_ms: '0' },
  update_stage:  { stage: '' },
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
          value={step.config.message ?? ''} onChange={(e) => onUpdate({ ...step, config: { message: e.target.value } })} />
      )}
      {step.type === 'update_stage' && (
        <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30" placeholder="Stage name"
          value={step.config.stage ?? ''} onChange={(e) => onUpdate({ ...step, config: { stage: e.target.value } })} />
      )}
      {step.type === 'send_template' && (
        <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30" placeholder="Template name"
          value={step.config.template_name ?? ''} onChange={(e) => onUpdate({ ...step, config: { template_name: e.target.value } })} />
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
    mutationFn: () => createFlow(workspaceId, {
      name, trigger: { type: triggerType, keyword: triggerValue, stage: triggerValue }, steps,
    }),
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
                {TRIGGER_TYPES.map((t) => <SelectItem key={t} value={t} className="hover:bg-white/5 focus:bg-white/5">{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            {(triggerType === 'keyword' || triggerType === 'stage_change') && (
              <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                placeholder={triggerType === 'keyword' ? 'Keywords, comma-separated (hi, hello, hey)' : 'Stage name'}
                value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/70">Steps</p>
              <Button variant="outline" size="sm" onClick={() => setSteps([...steps, { type: 'send_message', config: { message: '' } }])}
                className="border-white/10 text-white/60 hover:bg-white/5">
                <Plus className="h-3 w-3 mr-1" />Add step
              </Button>
            </div>
            {steps.map((step, i) => (
              <StepEditor key={i} step={step} index={i}
                onUpdate={(s) => setSteps(steps.map((x, idx) => idx === i ? s : x))}
                onRemove={() => setSteps(steps.filter((_, idx) => idx !== i))} />
            ))}
            {steps.length === 0 && <p className="text-xs text-white/30 text-center py-3">No steps yet — click Add step</p>}
          </div>
          <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim() || !workspaceId}>
            {save.isPending ? 'Creating…' : 'Create Flow'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── AI modal ─────────────────────────────────────────────────────────────────

function AIGenerateModal({ open, onClose, workspaceId, businessType }: { open: boolean; onClose: () => void; workspaceId: string; businessType?: string }) {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<'input' | 'loading'>('input');

  const handleClose = () => {
    if (step === 'loading') return;
    setStep('input'); setDescription(''); onClose();
  };

  const generate = async () => {
    if (!description.trim()) { toast.error('Please describe your business first'); return; }
    setStep('loading');
    try {
      const result: AIResult = await aiGenerateFlows(workspaceId, description.trim(), businessType);
      qc.invalidateQueries({ queryKey: ['flows', workspaceId] });
      toast.success(`${result.created} flows created! All are active — test them now.`);
      setStep('input'); setDescription(''); onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as Error)?.message || 'AI generation failed';
      toast.error(msg);
      setStep('input');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl bg-[#252525] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-400" />Generate Flows with AI
          </DialogTitle>
        </DialogHeader>
        {step === 'input' && (
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-sm font-medium text-white/80 mb-1.5">Describe your business</p>
              <textarea autoFocus rows={6} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: Hotel in Delhi. Check-in 2 PM, checkout 12 PM. Restaurant, spa, gym. Room service 24/7. Rooms from ₹3,500/night."
                className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-green-500/50"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }} />
              <p className="text-xs text-white/30 mt-1.5">AI creates 5 keyword flows: Main Menu + 4 option replies. All activated immediately.</p>
            </div>
            <Button onClick={generate} disabled={!description.trim()} className="w-full bg-green-600 hover:bg-green-700 text-white h-11 text-sm font-semibold">
              <Sparkles className="h-4 w-4 mr-2" />Generate 5 Flows
            </Button>
          </div>
        )}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div className="relative">
              <Loader2 className="h-10 w-10 text-green-400 animate-spin" />
              <Sparkles className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">Generating & creating flows…</p>
              <p className="text-sm text-white/40 mt-1">AI is writing messages and saving to your account</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Smart Menu visual tree ────────────────────────────────────────────────────

interface SmartMenuData {
  custom: Record<string, unknown>;
  defaults: {
    main: Record<LangKey, string>;
    sub: Record<string, Record<LangKey, string>>;
    replies: Record<string, Record<LangKey, string>>;
  };
  business_type: string;
}

function MessageBubble({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split('\n');
  const preview = lines.slice(0, 3).join('\n');
  const hasMore = lines.length > 3;
  return (
    <div className="rounded-lg p-2.5 text-xs leading-relaxed cursor-pointer"
      style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-line' }}
      onClick={() => hasMore && setExpanded(!expanded)}>
      {expanded ? text : preview}
      {hasMore && !expanded && <span className="text-white/30 ml-1">…</span>}
    </div>
  );
}

function LangTabs({ data, field }: { data: Record<LangKey, string>; field: string }) {
  const [activeLang, setActiveLang] = useState<LangKey>('english');
  if (!data) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1.5">
        {LANGS.map((l) => (
          <button key={l.key} onClick={() => setActiveLang(l.key)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${activeLang === l.key ? 'bg-green-500/20 text-green-400' : 'text-white/30 hover:text-white/50'}`}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>
      <MessageBubble key={`${field}-${activeLang}`} text={data[activeLang] || '(not set)'} />
    </div>
  );
}

type SubMenuEntry = Record<LangKey, string>;

function SubMenuNode({
  option, subData, repliesData, label,
}: {
  option: string;
  subData: SubMenuEntry;
  repliesData: Record<string, Record<LangKey, string>>;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const replyKeys = ['1','2','3','4'].map((n) => `${option}_${n}`);

  return (
    <div className="rounded-lg border border-white/8" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <button className="w-full flex items-center justify-between px-3 py-2.5 text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>{option}</span>
          <span className="text-sm font-medium text-white/80">{label}</span>
          <span className="text-xs text-white/30">sub-menu</span>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-white/30" /> : <ChevronDown className="h-3.5 w-3.5 text-white/30" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Sub-menu message */}
          <LangTabs data={subData} field={`sub_${option}`} />

          {/* Final replies */}
          <div className="space-y-2 pl-3 border-l border-white/8">
            {replyKeys.map((rk) => {
              const n = rk.split('_')[1];
              return (
                <div key={rk}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-mono px-1 py-0.5 rounded text-white/50"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>{n}</span>
                    <span className="text-xs text-white/40">→ final reply</span>
                  </div>
                  {repliesData[rk]
                    ? <LangTabs data={repliesData[rk]} field={rk} />
                    : <p className="text-xs text-white/20 italic">no reply defined</p>
                  }
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const OPTION_LABELS: Record<string, Record<string, string>> = {
  hotel:      { '1': 'Room Booking', '2': 'Check-in/out', '3': 'Room Service', '4': 'Location & Contact' },
  restaurant: { '1': 'View Menu', '2': 'Table Booking', '3': 'Home Delivery', '4': 'Timings & Location' },
  salon:      { '1': 'Our Services', '2': 'Book Appointment', '3': 'Timings & Location', '4': 'Offers & Packages' },
  general:    { '1': 'Service 1', '2': 'Service 2', '3': 'Contact', '4': 'Hours & Location' },
};

function SmartMenuTab({ workspaceId, businessType }: { workspaceId: string; businessType?: string }) {
  const qc = useQueryClient();
  const [aiLoading, setAiLoading] = useState(false);
  const [description, setDescription] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);

  const { data, isLoading } = useQuery<SmartMenuData>({
    queryKey: ['smart-menu', workspaceId],
    queryFn: () => getSmartMenu(workspaceId),
    enabled: !!workspaceId,
  });

  const resetCustom = useMutation({
    mutationFn: () => updateSmartMenu(workspaceId, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['smart-menu', workspaceId] }); toast.success('Reset to defaults'); },
  });

  const generateAI = async () => {
    if (!description.trim()) { toast.error('Describe your business first'); return; }
    setAiLoading(true);
    try {
      await aiGenerateSmartMenu(workspaceId, description.trim());
      qc.invalidateQueries({ queryKey: ['smart-menu', workspaceId] });
      toast.success('Smart menu content updated with AI!');
      setShowAiInput(false);
      setDescription('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as Error)?.message || 'Generation failed';
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  if (isLoading) return (
    <div className="space-y-2 mt-4">
      {[1,2,3,4].map((i) => <div key={i} className="h-12 rounded-lg animate-pulse bg-white/5" />)}
    </div>
  );

  const bt = data?.business_type || businessType || 'general';
  const optionLabels = OPTION_LABELS[bt] || OPTION_LABELS.general;

  // Merge custom over defaults
  const resolved = data?.defaults;
  if (!resolved) return null;

  const custom = (data?.custom || {}) as {
    main?: Record<LangKey, string>;
    sub?: Record<string, Record<LangKey, string>>;
    replies?: Record<string, Record<LangKey, string>>;
  };

  const mainData: Record<LangKey, string> = Object.fromEntries(
    LANGS.map((l) => [l.key, custom.main?.[l.key] || resolved.main[l.key] || ''])
  ) as Record<LangKey, string>;

  const subData = (opt: string): SubMenuEntry =>
    Object.fromEntries(LANGS.map((l) => [l.key, custom.sub?.[opt]?.[l.key] || resolved.sub?.[opt]?.[l.key] || ''])) as SubMenuEntry;

  const repliesData: Record<string, Record<LangKey, string>> = {};
  for (const opt of ['1','2','3','4']) {
    for (const n of ['1','2','3','4']) {
      const k = `${opt}_${n}`;
      repliesData[k] = Object.fromEntries(
        LANGS.map((l) => [l.key, custom.replies?.[k]?.[l.key] || resolved.replies?.[k]?.[l.key] || ''])
      ) as Record<LangKey, string>;
    }
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm"
          className="font-medium"
          style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}
          onClick={() => setShowAiInput(!showAiInput)}>
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          {showAiInput ? 'Cancel' : 'Customise with AI'}
        </Button>
        {Object.keys(custom).length > 0 && (
          <Button size="sm" variant="outline"
            className="border-white/10 text-white/50 hover:bg-white/5 text-xs"
            onClick={() => resetCustom.mutate()} disabled={resetCustom.isPending}>
            Reset to defaults
          </Button>
        )}
        <span className="text-xs text-white/30 ml-auto">
          {Object.keys(custom).length > 0 ? '✦ Using custom content' : 'Using default content'}
        </span>
      </div>

      {showAiInput && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)' }}>
          <p className="text-sm font-medium text-yellow-400/80">Customise menu with AI</p>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your business with real details: prices, timings, phone, address…"
            className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
          <Button size="sm" onClick={generateAI} disabled={aiLoading || !description.trim()}
            className="bg-yellow-500/80 hover:bg-yellow-500 text-black font-semibold">
            {aiLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Fill with AI</>}
          </Button>
        </div>
      )}

      {/* Level 0: Welcome */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">👋</span>
          <span className="text-sm font-semibold text-white">Level 0 — Welcome</span>
          <span className="text-xs text-white/30">trigger: hi / hello / hey</span>
        </div>
        <MessageBubble text={`Good [Morning/Afternoon/Evening] [Name]! 👋\nWelcome to [Business Name]!\n\nPlease select your language:\n1️⃣ Hindi\n2️⃣ English\n3️⃣ Hinglish`} />
      </div>

      {/* Level 1: Language selection */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🌐</span>
          <span className="text-sm font-semibold text-white">Level 1 — Language Selection</span>
          <span className="text-xs text-white/30">trigger: 1 / 2 / 3</span>
        </div>
        <p className="text-xs text-white/40 mb-2">When customer picks a language, stores it and sends main menu in that language.</p>
      </div>

      {/* Level 2: Main menu */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">📋</span>
          <span className="text-sm font-semibold text-white">Level 2 — Main Menu</span>
          <span className="text-xs text-white/30">sent after language selection</span>
        </div>
        <LangTabs data={mainData} field="main" />
      </div>

      {/* Level 3+4: Sub-menus and final replies */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-lg">📁</span>
          <span className="text-sm font-semibold text-white">Levels 3 & 4 — Sub-menus & Final Replies</span>
          <span className="text-xs text-white/30">trigger: 1 / 2 / 3 / 4 from main menu</span>
        </div>
        <div className="space-y-2">
          {['1','2','3','4'].map((opt) => (
            <SubMenuNode key={opt}
              option={opt}
              label={optionLabels[opt] || `Option ${opt}`}
              subData={subData(opt)}
              repliesData={repliesData}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', color: '#60a5fa' }}>
        <strong>How it works:</strong> Customer sends "hi" → welcome + language picker → customer picks language → main menu in their language → customer picks 1-4 → sub-menu → customer picks 1-4 → final reply. Customer can type "0" to go back or "menu" to restart.
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

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

  const openNew = () => {
    if (!activeWorkspace) { toast.error('Create a workspace first — go to Settings'); return; }
    setDialogOpen(true);
  };

  const openAI = () => {
    if (!activeWorkspace) { toast.error('Create a workspace first — go to Settings'); return; }
    setAiModalOpen(true);
  };

  return (
    <AppShell>
      <div className="p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Flows</h1>
            <p className="text-sm text-white/40 mt-0.5">Automate your WhatsApp conversations</p>
          </div>
          <div className="flex gap-2">
            {tab === 'manual' && (
              <>
                <Button size="sm" onClick={openAI}
                  className="font-medium"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate with AI
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={openNew}>
                  <Plus className="h-4 w-4 mr-1" />New Flow
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 rounded-xl p-1 w-fit" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {([
            { key: 'smart',  icon: <GitBranch className="h-3.5 w-3.5" />,  label: 'Smart Menu' },
            { key: 'manual', icon: <List       className="h-3.5 w-3.5" />,  label: 'Manual Flows' },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {!activeWorkspace && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            No workspace selected.{' '}
            <Link href="/settings" className="underline hover:text-amber-300">Go to Settings to create one.</Link>
          </div>
        )}

        {/* Smart Menu tab */}
        {tab === 'smart' && activeWorkspace && (
          <SmartMenuTab workspaceId={activeWorkspace.id} businessType={activeWorkspace.business_type ?? undefined} />
        )}

        {/* Manual Flows tab */}
        {tab === 'manual' && (
          isLoading ? (
            <div className="text-center py-16 text-white/30">Loading…</div>
          ) : flows.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Zap className="h-10 w-10 mx-auto mb-3 text-white/10" />
              <p className="mb-4">No flows yet. Create manually or let AI generate them.</p>
              <Button size="sm" onClick={openAI}
                className="font-medium"
                style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}>
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
                          <><ChevronRight className="h-3 w-3" />
                          <span className="font-mono text-white/60 truncate max-w-[120px]">{flow.trigger.keyword}</span></>
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
