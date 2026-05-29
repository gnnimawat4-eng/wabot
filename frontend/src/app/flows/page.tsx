'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, Trash2, ChevronRight, Zap, AlertCircle, Sparkles, Check, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceStore } from '@/lib/store';
import { getFlows, createFlow, updateFlow, deleteFlow, aiGenerateFlows } from '@/lib/api';
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

interface AIFlow {
  name: string;
  trigger_keywords: string;
  message: string;
}

// ── Manual flow dialog (existing) ─────────────────────────────────────────────

const STEP_TYPES = [
  { value: 'send_message', label: 'Send Message' },
  { value: 'send_buttons', label: 'Send Buttons' },
  { value: 'on_reply', label: 'On Reply (branch)' },
  { value: 'send_template', label: 'Send Template' },
  { value: 'wait', label: 'Wait' },
  { value: 'update_stage', label: 'Update Stage' },
];
const TRIGGER_TYPES = ['keyword', 'new_contact', 'stage_change'];
const DEFAULT_CONFIG: Record<string, StepConfig> = {
  send_message: { message: '' },
  send_buttons: { body: '', buttons: ['', '', ''] },
  on_reply: { branches: Array.from({ length: 3 }, () => ({ match: '', message: '' })) },
  send_template: { template_name: '' },
  wait: { delay_ms: '0' },
  update_stage: { stage: '' },
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
        <SelectContent className="bg-[#0d1424] border-white/10 text-white">
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#0d1424] border-white/10 text-white">
        <DialogHeader><DialogTitle className="text-white">New Flow</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input className="bg-white/5 border-white/10 text-white placeholder:text-white/30" placeholder="Flow name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">Trigger</p>
            <Select value={triggerType} onValueChange={(v) => v && setTriggerType(v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#0d1424] border-white/10 text-white">
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

// ── AI Generate Modal ──────────────────────────────────────────────────────────

function AIGenerateModal({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<'input' | 'loading' | 'preview'>('input');
  const [generatedFlows, setGeneratedFlows] = useState<AIFlow[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);

  const handleClose = () => {
    setStep('input');
    setDescription('');
    setGeneratedFlows([]);
    setSelected([]);
    onClose();
  };

  const generate = async () => {
    if (!description.trim()) { toast.error('Please describe your business first'); return; }
    setStep('loading');
    try {
      const flows: AIFlow[] = await aiGenerateFlows(workspaceId, description.trim());
      if (!flows?.length) throw new Error('No flows generated');
      setGeneratedFlows(flows);
      setSelected(flows.map(() => true));
      setStep('preview');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as Error)?.message || 'AI generation failed';
      toast.error(msg);
      setStep('input');
    }
  };

  const createSelected = useMutation({
    mutationFn: async () => {
      const toCreate = generatedFlows.filter((_, i) => selected[i]);
      await Promise.all(
        toCreate.map((f) =>
          createFlow(workspaceId, {
            name: f.name,
            trigger: { type: 'keyword', keyword: f.trigger_keywords },
            steps: [{ type: 'send_message', config: { message: f.message } }],
          })
        )
      );
      return toCreate.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['flows', workspaceId] });
      toast.success(`${count} flow${count !== 1 ? 's' : ''} created! Review and activate them.`);
      handleClose();
    },
    onError: () => toast.error('Failed to create some flows'),
  });

  const selectedCount = selected.filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-[#0d1424] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-400" />
            Generate Flows with AI
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Input ── */}
        {step === 'input' && (
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-sm font-medium text-white/80 mb-1.5">Describe your business</p>
              <textarea
                autoFocus
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`Example: I run a hotel in Delhi. Check-in at 2 PM, check-out at 12 PM. We have a restaurant, spa and gym. Room service available 24/7. We have deluxe rooms starting from ₹3,500 per night.`}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-green-500/50 leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
              />
              <p className="text-xs text-white/30 mt-1.5">Include: business type, timings, services, pricing. More detail = better flows.</p>
            </div>
            <Button onClick={generate} disabled={!description.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-11 text-sm font-semibold">
              <Sparkles className="h-4 w-4 mr-2" />Generate Flows
            </Button>
          </div>
        )}

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative">
              <Loader2 className="h-10 w-10 text-green-400 animate-spin" />
              <Sparkles className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">AI is creating your flows…</p>
              <p className="text-sm text-white/40 mt-1">Analyzing your business and generating tailored flows</p>
            </div>
          </div>
        )}

        {/* ── Preview ── */}
        {step === 'preview' && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                AI generated <span className="text-green-400">{generatedFlows.length} flows</span> for you
              </p>
              <button onClick={() => setStep('input')} className="text-xs text-white/40 hover:text-white/60 underline">
                ← Change description
              </button>
            </div>

            <div className="space-y-3">
              {generatedFlows.map((flow, i) => (
                <div key={i}
                  className={`rounded-xl p-4 border transition-all cursor-pointer ${selected[i] ? 'border-green-500/40 bg-green-500/5' : 'border-white/8 bg-white/3 opacity-50'}`}
                  onClick={() => { const n = [...selected]; n[i] = !n[i]; setSelected(n); }}>
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className={`mt-0.5 h-5 w-5 rounded flex items-center justify-center shrink-0 transition-colors ${selected[i] ? 'bg-green-500' : 'border border-white/20'}`}>
                      {selected[i] && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Flow name */}
                      <p className="text-sm font-semibold text-white mb-1">{flow.name}</p>
                      {/* Triggers */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {flow.trigger_keywords.split(',').map((kw) => kw.trim()).filter(Boolean).map((kw) => (
                          <span key={kw} className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(22,163,74,0.12)', color: '#4ade80' }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                      {/* Message preview */}
                      <div className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' }}>
                        <p className="line-clamp-3 whitespace-pre-line">{flow.message}</p>
                      </div>
                    </div>
                    {/* Toggle button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); const n = [...selected]; n[i] = !n[i]; setSelected(n); }}
                      className={`shrink-0 p-1.5 rounded-full transition-colors ${selected[i] ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}>
                      {selected[i] ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={handleClose}
                className="border-white/10 text-white/60 hover:bg-white/5">
                Cancel
              </Button>
              <Button
                onClick={() => createSelected.mutate()}
                disabled={createSelected.isPending || selectedCount === 0}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                {createSelected.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create {selectedCount} Selected Flow{selectedCount !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const { data: flows = [], isLoading } = useQuery<Flow[]>({
    queryKey: ['flows', activeWorkspace?.id],
    queryFn: () => getFlows(activeWorkspace!.id),
    enabled: !!activeWorkspace,
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
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Flows</h1>
            <p className="text-sm text-white/40 mt-0.5">Automate your WhatsApp responses</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={openAI}
              className="border font-medium"
              style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(234,179,8,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(234,179,8,0.1)'; }}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate with AI
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />New Flow
            </Button>
          </div>
        </div>

        {!activeWorkspace && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            No workspace selected.{' '}
            <Link href="/settings" className="underline hover:text-amber-300">Go to Settings to create one.</Link>
          </div>
        )}

        {/* Flow list */}
        {isLoading ? (
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
        )}
      </div>

      <FlowDialog open={dialogOpen} onClose={() => setDialogOpen(false)} workspaceId={activeWorkspace?.id ?? ''} />
      <AIGenerateModal open={aiModalOpen} onClose={() => setAiModalOpen(false)} workspaceId={activeWorkspace?.id ?? ''} />
    </AppShell>
  );
}
