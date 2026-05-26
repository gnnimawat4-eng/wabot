'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Save, Power, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceStore } from '@/lib/store';
import { getFlow, updateFlow, updateFlowSteps } from '@/lib/api';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

type Branch = { match: string; message: string };
type StepConfig = Record<string, unknown> & {
  message?: string;
  body?: string;
  buttons?: string[];
  branches?: Branch[];
  delay_minutes?: string | number;
  stage?: string;
  template_name?: string;
  reminder_delay_minutes?: number;
  reminder_message?: string;
};
type Step = { type: string; config: StepConfig };
type Flow = {
  id: string;
  name: string;
  trigger: { type: string; keyword?: string; stage?: string };
  is_active: boolean;
  created_at: string;
  flow_steps: Array<{ position: number; type: string; config: StepConfig }>;
};

// ── Constants ────────────────────────────────────────────────────────────────

const STEP_TYPES = [
  { value: 'send_message', label: 'Send Message' },
  { value: 'send_buttons', label: 'Send Buttons (interactive)' },
  { value: 'on_reply', label: 'On Reply (branch by answer)' },
  { value: 'send_template', label: 'Send Template' },
  { value: 'wait', label: 'Wait' },
  { value: 'update_stage', label: 'Update Stage' },
];

const TRIGGER_TYPES = ['keyword', 'new_contact', 'stage_change'];

const REMINDER_OPTIONS = [
  { value: '0', label: 'No reminder' },
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes' },
];

const DEFAULT_CONFIG: Record<string, StepConfig> = {
  send_message: { message: '' },
  send_buttons: { body: '', buttons: ['', '', ''] },
  on_reply: {
    branches: Array.from({ length: 10 }, () => ({ match: '', message: '' })),
    reminder_delay_minutes: 0,
    reminder_message: '',
  },
  send_template: { template_name: '' },
  wait: { delay_minutes: '0' },
  update_stage: { stage: '' },
};

// ── Step editors ──────────────────────────────────────────────────────────────

function SendMessageEditor({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <textarea
      rows={4}
      className="w-full rounded-md bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-sm px-3 py-2 resize-y focus:outline-none focus:border-green-500/50"
      placeholder="Message text — supports emojis and newlines"
      value={config.message ?? ''}
      onChange={(e) => onChange({ ...config, message: e.target.value })}
    />
  );
}

function SendButtonsEditor({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  const buttons = (config.buttons ?? ['', '', '']) as string[];
  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        className="w-full rounded-md bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-sm px-3 py-2 resize-none focus:outline-none focus:border-green-500/50"
        placeholder="Message body shown above the buttons"
        value={config.body ?? ''}
        onChange={(e) => onChange({ ...config, body: e.target.value })}
      />
      <p className="text-xs text-white/40">Buttons (max 3, 20 chars each)</p>
      {buttons.map((btn, bi) => (
        <Input
          key={bi}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm"
          placeholder={`Button ${bi + 1} label`}
          value={btn}
          maxLength={20}
          onChange={(e) => {
            const next = [...buttons];
            next[bi] = e.target.value;
            onChange({ ...config, buttons: next });
          }}
        />
      ))}
    </div>
  );
}

function OnReplyEditor({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  const branches: Branch[] = (config.branches ?? [{ match: '', message: '' }]) as Branch[];
  const reminderDelay = String(config.reminder_delay_minutes ?? 0);
  const reminderMessage = String(config.reminder_message ?? '');

  const updateBranch = (i: number, field: keyof Branch, val: string) => {
    const next = branches.map((b, idx) => (idx === i ? { ...b, [field]: val } : b));
    onChange({ ...config, branches: next });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40">Define branches — each maps a reply keyword to a response message</p>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {branches.map((branch, i) => (
          <div key={i} className="border border-white/8 rounded-md p-2.5 space-y-1.5 bg-white/3">
            <p className="text-xs text-white/40">Branch {i + 1}</p>
            <Input
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm"
              placeholder="If reply contains… (e.g. Option 1)"
              value={branch.match}
              onChange={(e) => updateBranch(i, 'match', e.target.value)}
            />
            <textarea
              rows={2}
              className="w-full rounded-md bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-sm px-3 py-1.5 resize-none focus:outline-none focus:border-green-500/50"
              placeholder="Then send this message"
              value={branch.message}
              onChange={(e) => updateBranch(i, 'message', e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="border-t border-white/8 pt-3 space-y-2">
        <p className="text-xs text-white/40">Inactivity reminder (sent once if customer doesn&apos;t reply)</p>
        <Select
          value={reminderDelay}
          onValueChange={(v) => onChange({ ...config, reminder_delay_minutes: Number(v) })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0d1424] border-white/10 text-white">
            {REMINDER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="hover:bg-white/5 focus:bg-white/5">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {Number(reminderDelay) > 0 && (
          <Input
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm"
            placeholder="Reminder message (e.g. Still there? Tap an option to continue)"
            value={reminderMessage}
            onChange={(e) => onChange({ ...config, reminder_message: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
  total,
  onUpdate,
  onRemove,
}: {
  step: Step;
  index: number;
  total: number;
  onUpdate: (s: Step) => void;
  onRemove: () => void;
}) {
  const typeLabel = STEP_TYPES.find((t) => t.value === step.type)?.label ?? step.type;

  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-3">
      {/* Step header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/60">
            {index + 1}
          </span>
          <span className="text-xs text-white/50">{typeLabel}</span>
        </div>
        <button
          onClick={onRemove}
          disabled={total === 1}
          className="p-1.5 rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Delete step"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step type selector */}
      <Select
        value={step.type}
        onValueChange={(v) => v && onUpdate({ type: v, config: DEFAULT_CONFIG[v] ?? {} })}
      >
        <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#0d1424] border-white/10 text-white">
          {STEP_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value} className="hover:bg-white/5 focus:bg-white/5">
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Step config editor */}
      {step.type === 'send_message' && (
        <SendMessageEditor config={step.config} onChange={(c) => onUpdate({ ...step, config: c })} />
      )}
      {step.type === 'send_buttons' && (
        <SendButtonsEditor config={step.config} onChange={(c) => onUpdate({ ...step, config: c })} />
      )}
      {step.type === 'on_reply' && (
        <OnReplyEditor config={step.config} onChange={(c) => onUpdate({ ...step, config: c })} />
      )}
      {step.type === 'wait' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm w-24"
            placeholder="0"
            value={step.config.delay_minutes as string ?? '0'}
            onChange={(e) =>
              onUpdate({ ...step, config: { delay_minutes: e.target.value, delay_ms: String(Number(e.target.value) * 60000) } })
            }
          />
          <span className="text-sm text-white/50">minutes</span>
        </div>
      )}
      {step.type === 'update_stage' && (
        <Input
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm"
          placeholder="New stage name (e.g. qualified)"
          value={step.config.stage ?? ''}
          onChange={(e) => onUpdate({ ...step, config: { stage: e.target.value } })}
        />
      )}
      {step.type === 'send_template' && (
        <Input
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm"
          placeholder="WhatsApp template name"
          value={step.config.template_name ?? ''}
          onChange={(e) => onUpdate({ ...step, config: { template_name: e.target.value } })}
        />
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function stepsFromApi(rawSteps: Flow['flow_steps']): Step[] {
  if (!rawSteps?.length) return [];
  return [...rawSteps]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ type: s.type, config: (s.config ?? {}) as StepConfig }));
}

export default function FlowDetailPage() {
  const { id: flowId } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();

  const { data: flow, isLoading, isError } = useQuery<Flow>({
    queryKey: ['flow', activeWorkspace?.id, flowId],
    queryFn: () => getFlow(activeWorkspace!.id, flowId),
    enabled: !!activeWorkspace && !!flowId,
  });

  // Local editable state
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('keyword');
  const [triggerValue, setTriggerValue] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [dirty, setDirty] = useState(false);

  // Populate from fetched flow
  useEffect(() => {
    if (!flow) return;
    setName(flow.name ?? '');
    setTriggerType(flow.trigger?.type ?? 'keyword');
    setTriggerValue(flow.trigger?.keyword ?? flow.trigger?.stage ?? '');
    setSteps(stepsFromApi(flow.flow_steps));
    setDirty(false);
  }, [flow]);

  const markDirty = () => setDirty(true);

  const updateStep = (i: number, s: Step) => { setSteps((prev) => prev.map((x, idx) => (idx === i ? s : x))); markDirty(); };
  const addStep = () => { setSteps((prev) => [...prev, { type: 'send_message', config: { message: '' } }]); markDirty(); };
  const removeStep = (i: number) => { setSteps((prev) => prev.filter((_, idx) => idx !== i)); markDirty(); };

  const save = useMutation({
    mutationFn: async () => {
      if (!activeWorkspace || !flowId) throw new Error('No workspace');
      const triggerPayload: Record<string, string> = { type: triggerType };
      if (triggerType === 'keyword') triggerPayload.keyword = triggerValue;
      if (triggerType === 'stage_change') triggerPayload.stage = triggerValue;

      await updateFlow(activeWorkspace.id, flowId, { name: name.trim(), trigger: triggerPayload });
      await updateFlowSteps(activeWorkspace.id, flowId, steps);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flow', activeWorkspace?.id, flowId] });
      qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] });
      setDirty(false);
      toast.success('Flow saved');
    },
    onError: () => toast.error('Failed to save flow'),
  });

  const toggleActive = useMutation({
    mutationFn: () => updateFlow(activeWorkspace!.id, flowId, { is_active: !flow?.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flow', activeWorkspace?.id, flowId] });
      qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] });
    },
  });

  if (!activeWorkspace) {
    return (
      <AppShell>
        <div className="p-6 text-white/40 text-sm">Select a workspace first.</div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell>
        <div className="p-6">
          <p className="text-red-400 text-sm mb-4">Flow not found or could not be loaded.</p>
          <Button size="sm" onClick={() => router.push('/flows')} className="bg-white/8 border border-white/10 text-white/60">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to Flows
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-6 max-w-2xl">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <button
            onClick={() => router.push('/flows')}
            className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Flows
          </button>

          <div className="flex items-center gap-2">
            {flow && (
              <Button
                size="sm"
                onClick={() => toggleActive.mutate()}
                disabled={toggleActive.isPending}
                className={
                  flow.is_active
                    ? 'bg-white/8 hover:bg-white/12 border border-white/10 text-white/60'
                    : 'bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400'
                }
              >
                <Power className="h-3.5 w-3.5 mr-1.5" />
                {flow.is_active ? 'Pause' : 'Activate'}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
            >
              {save.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              ) : (
                <><Save className="h-3.5 w-3.5 mr-1.5" />Save</>
              )}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Status badge */}
            <div className="flex items-center gap-2 mb-6">
              <Badge className={flow?.is_active ? 'bg-green-500/20 text-green-400 border-0' : 'bg-white/5 text-white/40 border-0'}>
                {flow?.is_active ? 'Active' : 'Paused'}
              </Badge>
              {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
            </div>

            {/* Flow name */}
            <section className="mb-6">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Flow Name</label>
              <Input
                className="mt-2 bg-white/5 border-white/10 text-white placeholder:text-white/30 text-base font-semibold focus:border-green-500/50"
                placeholder="Flow name"
                value={name}
                onChange={(e) => { setName(e.target.value); markDirty(); }}
              />
            </section>

            {/* Trigger */}
            <section className="mb-6">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Trigger</label>
              <div className="mt-2 space-y-2">
                <Select
                  value={triggerType}
                  onValueChange={(v) => { if (v) { setTriggerType(v); setTriggerValue(''); markDirty(); } }}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1424] border-white/10 text-white">
                    {TRIGGER_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="hover:bg-white/5 focus:bg-white/5">
                        {t.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {triggerType === 'keyword' && (
                  <div>
                    <Input
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-green-500/50"
                      placeholder="Keywords, comma-separated (e.g. hi, hello, hey, namaste)"
                      value={triggerValue}
                      onChange={(e) => { setTriggerValue(e.target.value); markDirty(); }}
                    />
                    <p className="text-xs text-white/30 mt-1">
                      Flow triggers when customer sends any of these keywords
                    </p>
                  </div>
                )}
                {triggerType === 'stage_change' && (
                  <Input
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-green-500/50"
                    placeholder="Stage name (e.g. qualified)"
                    value={triggerValue}
                    onChange={(e) => { setTriggerValue(e.target.value); markDirty(); }}
                  />
                )}
                {triggerType === 'new_contact' && (
                  <p className="text-xs text-white/40">Triggers automatically when a new contact is added.</p>
                )}
              </div>
            </section>

            {/* Steps */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                  Steps ({steps.length})
                </label>
                <Button
                  size="sm"
                  onClick={addStep}
                  className="bg-white/8 hover:bg-white/12 border border-white/10 text-white/60 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Step
                </Button>
              </div>

              {steps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
                  <p className="text-white/30 text-sm mb-3">No steps yet</p>
                  <Button size="sm" onClick={addStep} className="bg-green-600 hover:bg-green-700 text-white">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Add First Step
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, i) => (
                    <StepCard
                      key={i}
                      step={step}
                      index={i}
                      total={steps.length}
                      onUpdate={(s) => updateStep(i, s)}
                      onRemove={() => removeStep(i)}
                    />
                  ))}
                  <Button
                    size="sm"
                    onClick={addStep}
                    className="w-full bg-white/5 hover:bg-white/8 border border-dashed border-white/15 text-white/40 hover:text-white/60 mt-1"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Add Step
                  </Button>
                </div>
              )}
            </section>

            {/* Bottom save bar */}
            {dirty && (
              <div className="sticky bottom-0 mt-6 -mx-6 px-6 py-4 bg-[#0a0f1e]/95 border-t border-white/5 backdrop-blur-sm">
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {save.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />Save Flow</>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
