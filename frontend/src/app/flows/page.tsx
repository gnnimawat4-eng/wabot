'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, Trash2, ChevronRight, Zap, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceStore } from '@/lib/store';
import { getFlows, createFlow, updateFlow, deleteFlow } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

type Branch = { match: string; message: string };
type StepConfig = Record<string, unknown> & {
  message?: string;
  body?: string;
  buttons?: string[];
  branches?: Branch[];
  delay_ms?: string;
  stage?: string;
  template_name?: string;
};
type Step = { type: string; config: StepConfig };
type Flow = { id: string; name: string; trigger: Record<string, string>; is_active: boolean; created_at: string; flow_steps: Step[] };

const STEP_TYPES = [
  { value: 'send_message', label: 'Send Message' },
  { value: 'send_buttons', label: 'Send Buttons (interactive)' },
  { value: 'on_reply', label: 'On Reply (branch by answer)' },
  { value: 'send_template', label: 'Send Template' },
  { value: 'wait', label: 'Wait' },
  { value: 'update_stage', label: 'Update Stage' },
];

const TRIGGER_TYPES = ['keyword', 'new_contact', 'stage_change'];

const DEFAULT_CONFIG: Record<string, StepConfig> = {
  send_message: { message: '' },
  send_buttons: { body: '', buttons: ['', '', ''] },
  on_reply: { branches: Array.from({ length: 10 }, () => ({ match: '', message: '' })), reminder_delay_minutes: 0, reminder_message: '' },
  send_template: { template_name: '' },
  wait: { delay_ms: '0' },
  update_stage: { stage: '' },
};

function SendButtonsEditor({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  const buttons = config.buttons ?? ['', '', ''];
  return (
    <div className="space-y-2">
      <Input
        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
        placeholder="Message body (e.g. What are you looking for?)"
        value={config.body ?? ''}
        onChange={(e) => onChange({ ...config, body: e.target.value })}
      />
      <p className="text-xs text-white/40">Buttons (max 3, 20 chars each)</p>
      {buttons.map((btn, bi) => (
        <Input
          key={bi}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
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

const REMINDER_OPTIONS = [
  { value: '0', label: 'No reminder' },
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes' },
];

function OnReplyEditor({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  const branches: Branch[] = config.branches ?? [{ match: '', message: '' }];
  const reminderDelay = String(config.reminder_delay_minutes ?? 0);
  const reminderMessage = String(config.reminder_message ?? '');

  const updateBranch = (i: number, field: keyof Branch, val: string) => {
    const next = branches.map((b, idx) => idx === i ? { ...b, [field]: val } : b);
    onChange({ ...config, branches: next });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40">Match the button reply text → send a response</p>
      {branches.map((branch, i) => (
        <div key={i} className="border border-white/8 rounded-md p-2 space-y-1.5 bg-white/3">
          <p className="text-xs text-white/50">Branch {i + 1}</p>
          <Input
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm"
            placeholder="If reply contains… (e.g. Analytical)"
            value={branch.match}
            onChange={(e) => updateBranch(i, 'match', e.target.value)}
          />
          <Input
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm"
            placeholder="Then send this message"
            value={branch.message}
            onChange={(e) => updateBranch(i, 'message', e.target.value)}
          />
        </div>
      ))}

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
            placeholder="Reminder message (e.g. Still there? Tap a button to continue)"
            value={reminderMessage}
            onChange={(e) => onChange({ ...config, reminder_message: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

function StepEditor({ step, index, onUpdate, onRemove }: {
  step: Step;
  index: number;
  onUpdate: (s: Step) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-white/10 rounded-lg p-3 space-y-2 bg-white/3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">Step {index + 1}</span>
        <button onClick={onRemove}>
          <Trash2 className="h-3 w-3 text-red-400" />
        </button>
      </div>
      <Select
        value={step.type}
        onValueChange={(v) => v && onUpdate({ type: v, config: DEFAULT_CONFIG[v] ?? {} })}
      >
        <SelectTrigger className="bg-white/5 border-white/10 text-white">
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

      {step.type === 'send_message' && (
        <Input
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
          placeholder="Message text"
          value={step.config.message ?? ''}
          onChange={(e) => onUpdate({ ...step, config: { message: e.target.value } })}
        />
      )}
      {step.type === 'send_buttons' && (
        <SendButtonsEditor
          config={step.config}
          onChange={(c) => onUpdate({ ...step, config: c })}
        />
      )}
      {step.type === 'on_reply' && (
        <OnReplyEditor
          config={step.config}
          onChange={(c) => onUpdate({ ...step, config: c })}
        />
      )}
      {step.type === 'wait' && (
        <Input
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
          placeholder="Delay in minutes"
          type="number"
          value={step.config.delay_minutes as string ?? ''}
          onChange={(e) => onUpdate({ ...step, config: { delay_ms: String(Number(e.target.value) * 60000) } })}
        />
      )}
      {step.type === 'update_stage' && (
        <Input
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
          placeholder="New stage (e.g. qualified)"
          value={step.config.stage ?? ''}
          onChange={(e) => onUpdate({ ...step, config: { stage: e.target.value } })}
        />
      )}
      {step.type === 'send_template' && (
        <Input
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
          placeholder="Template name"
          value={step.config.template_name ?? ''}
          onChange={(e) => onUpdate({ ...step, config: { template_name: e.target.value } })}
        />
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

  const addStep = () => setSteps([...steps, { type: 'send_message', config: { message: '' } }]);
  const updateStep = (i: number, s: Step) => setSteps(steps.map((x, idx) => idx === i ? s : x));
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));

  const save = useMutation({
    mutationFn: () => createFlow(workspaceId, {
      name,
      trigger: { type: triggerType, keyword: triggerValue, stage: triggerValue },
      steps,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows', workspaceId] });
      toast.success('Flow created');
      onClose();
    },
    onError: () => toast.error('Failed to create flow'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#0d1424] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">New Flow</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            placeholder="Flow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">Trigger</p>
            <Select value={triggerType} onValueChange={(v) => v && setTriggerType(v)}>
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
              <Input
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                placeholder="Keywords, comma-separated (e.g. hi, hello, hey)"
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
              />
            )}
            {triggerType === 'stage_change' && (
              <Input
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                placeholder="Stage name"
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/70">Steps</p>
              <Button variant="outline" size="sm" onClick={addStep} className="border-white/10 text-white/60 hover:bg-white/5">
                <Plus className="h-3 w-3 mr-1" />Add step
              </Button>
            </div>
            {steps.map((step, i) => (
              <StepEditor
                key={i}
                step={step}
                index={i}
                onUpdate={(s) => updateStep(i, s)}
                onRemove={() => removeStep(i)}
              />
            ))}
            {steps.length === 0 && (
              <p className="text-xs text-white/30 text-center py-3">No steps yet — click Add step</p>
            )}
          </div>

          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim() || !workspaceId}
          >
            {save.isPending ? 'Creating…' : 'Create Flow'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FlowsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] });
      toast.success('Flow deleted');
    },
  });

  const openNew = () => {
    if (!activeWorkspace) {
      toast.error('Create a workspace first — go to Settings');
      return;
    }
    setDialogOpen(true);
  };

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Flows</h1>
            <p className="text-sm text-white/40 mt-0.5">Automate your WhatsApp responses</p>
          </div>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />New Flow
          </Button>
        </div>

        {!activeWorkspace && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            No workspace selected.{' '}
            <Link href="/settings" className="underline hover:text-amber-300">
              Go to Settings to create one.
            </Link>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16 text-white/30">Loading…</div>
        ) : flows.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <Zap className="h-10 w-10 mx-auto mb-3 text-white/10" />
            <p>No flows yet. Create one to start automating.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flows.map((flow) => (
              <Card key={flow.id} className="bg-white/5 border-white/8 hover:bg-white/8 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base text-white">{flow.name}</CardTitle>
                    <Badge className={flow.is_active ? 'bg-green-500/20 text-green-400 border-0' : 'bg-white/5 text-white/40 border-0'}>
                      {flow.is_active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1 text-sm text-white/40 mb-3">
                    <Zap className="h-3 w-3" />
                    <span>Trigger: {flow.trigger?.type ?? '—'}</span>
                    {flow.trigger?.keyword && (
                      <>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-mono text-white/60">{flow.trigger.keyword}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-white/30 mb-4">{flow.flow_steps?.length ?? 0} steps · {timeAgo(flow.created_at)}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-white/10 text-white/60 hover:bg-white/5"
                      onClick={() => toggle.mutate({ id: flow.id, is_active: !flow.is_active })}
                    >
                      <Power className="h-3 w-3 mr-1" />{flow.is_active ? 'Pause' : 'Activate'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 hover:bg-red-500/10"
                      onClick={() => remove.mutate(flow.id)}
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <FlowDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workspaceId={activeWorkspace?.id ?? ''}
      />
    </AppShell>
  );
}
