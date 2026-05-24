'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, Trash2, ChevronRight, Zap } from 'lucide-react';
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

type Step = { type: string; config: Record<string, string> };
type Flow = { id: string; name: string; trigger: Record<string, string>; is_active: boolean; created_at: string; flow_steps: Step[] };

const STEP_TYPES = ['send_message', 'send_template', 'wait', 'update_stage', 'condition'];
const TRIGGER_TYPES = ['keyword', 'new_contact', 'stage_change'];

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
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Flow</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Flow name" value={name} onChange={(e) => setName(e.target.value)} />

          <div className="space-y-2">
            <p className="text-sm font-medium">Trigger</p>
            <Select value={triggerType} onValueChange={(v) => v && setTriggerType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            {triggerType === 'keyword' && (
              <Input placeholder="Keyword (e.g. hello)" value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} />
            )}
            {triggerType === 'stage_change' && (
              <Input placeholder="Stage name" value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Steps</p>
              <Button variant="outline" size="sm" onClick={addStep}><Plus className="h-3 w-3 mr-1" />Add step</Button>
            </div>
            {steps.map((step, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Step {i + 1}</span>
                  <button onClick={() => removeStep(i)}><Trash2 className="h-3 w-3 text-red-400" /></button>
                </div>
                <Select value={step.type} onValueChange={(v) => v && updateStep(i, { type: v, config: {} })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STEP_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
                {step.type === 'send_message' && (
                  <Input placeholder="Message text" value={step.config.message ?? ''} onChange={(e) => updateStep(i, { ...step, config: { message: e.target.value } })} />
                )}
                {step.type === 'wait' && (
                  <Input placeholder="Delay in minutes" type="number" value={step.config.delay_minutes ?? ''} onChange={(e) => updateStep(i, { ...step, config: { delay_ms: String(Number(e.target.value) * 60000) } })} />
                )}
                {step.type === 'update_stage' && (
                  <Input placeholder="New stage (e.g. qualified)" value={step.config.stage ?? ''} onChange={(e) => updateStep(i, { ...step, config: { stage: e.target.value } })} />
                )}
                {step.type === 'send_template' && (
                  <Input placeholder="Template name" value={step.config.template_name ?? ''} onChange={(e) => updateStep(i, { ...step, config: { template_name: e.target.value } })} />
                )}
              </div>
            ))}
          </div>

          <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => save.mutate()} disabled={save.isPending || !name}>
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

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Flows</h1>
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />New Flow
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : flows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Zap className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>No flows yet. Create one to start automating.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flows.map((flow) => (
              <Card key={flow.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{flow.name}</CardTitle>
                    <Badge variant={flow.is_active ? 'default' : 'secondary'} className={flow.is_active ? 'bg-green-100 text-green-800' : ''}>
                      {flow.is_active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                    <Zap className="h-3 w-3" />
                    <span>Trigger: {flow.trigger?.type ?? '—'}</span>
                    {flow.trigger?.keyword && <><ChevronRight className="h-3 w-3" /><span className="font-mono">{flow.trigger.keyword}</span></>}
                  </div>
                  <p className="text-xs text-gray-400 mb-4">{flow.flow_steps?.length ?? 0} steps · {timeAgo(flow.created_at)}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => toggle.mutate({ id: flow.id, is_active: !flow.is_active })}>
                      <Power className="h-3 w-3 mr-1" />{flow.is_active ? 'Pause' : 'Activate'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => remove.mutate(flow.id)}>
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {activeWorkspace && (
        <FlowDialog open={dialogOpen} onClose={() => setDialogOpen(false)} workspaceId={activeWorkspace.id} />
      )}
    </AppShell>
  );
}
