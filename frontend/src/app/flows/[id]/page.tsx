'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { getFlow, updateFlow, updateFlowSteps } from '@/lib/api';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type StepConfig = Record<string, unknown>;
type Step = { type: string; config: StepConfig };
type Flow = {
  id: string; name: string;
  trigger: { type: string; keyword?: string };
  is_active: boolean;
  flow_steps: Array<{ position: number; type: string; config: StepConfig }>;
};

const inp: React.CSSProperties = {
  background: 'var(--wb-bg)', border: '1px solid var(--wb-border)', color: 'var(--wb-text)', borderRadius: 8,
};

// ── Simple message bubble ─────────────────────────────────────────────────────

function MessageBubble({ index, message, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  index: number; message: string;
  onChange: (m: string) => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  return (
    <div className="flex gap-2 items-start group">
      <div className="flex flex-col gap-0.5 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 rounded disabled:opacity-20" style={{ color: 'var(--wb-text-3)' }}><ChevronUp className="h-3.5 w-3.5" /></button>
        <button onClick={onMoveDown} disabled={isLast} className="p-0.5 rounded disabled:opacity-20" style={{ color: 'var(--wb-text-3)' }}><ChevronDown className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex-1">
        <p className="text-xs mb-1.5" style={{ color: 'var(--wb-text-3)' }}>Message {index + 1}</p>
        <div className="rounded-2xl rounded-tl-sm" style={{ background: 'var(--wb-bg-active)', border: '1px solid var(--wb-accent-ring)' }}>
          <textarea
            value={message}
            onChange={(e) => { onChange(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; }}
            placeholder="Type your message… (supports emojis 😊)"
            rows={3}
            className="w-full px-3 py-2.5 text-sm resize-none focus:outline-none bg-transparent rounded-2xl"
            style={{ color: 'var(--wb-text)', lineHeight: 1.6 }}
          />
        </div>
      </div>
      <button onClick={onDelete} className="mt-7 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--wb-text-3)' }}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Advanced step editor ───────────────────────────────────────────────────────

const STEP_TYPES = [
  { value: 'send_message', label: 'Send Message' },
  { value: 'wait', label: 'Wait (delay)' },
  { value: 'send_buttons', label: 'Send Buttons' },
  { value: 'on_reply', label: 'On Reply (branch)' },
  { value: 'update_stage', label: 'Update Stage' },
  { value: 'send_template', label: 'Send Template' },
];

function AdvancedStep({ step, onChange, onDelete }: { step: Step; onChange: (s: Step) => void; onDelete: () => void; }) {
  const cfg = step.config;
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--wb-border)', background: 'var(--wb-bg)' }}>
      <div className="flex items-center justify-between">
        <select value={step.type} onChange={(e) => onChange({ type: e.target.value, config: {} })}
          className="text-sm rounded-lg px-2 py-1.5 focus:outline-none" style={inp}>
          {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={onDelete} className="p-1" style={{ color: 'var(--wb-text-3)' }}><Trash2 className="h-4 w-4" /></button>
      </div>
      {step.type === 'send_message' && (
        <textarea rows={3} value={(cfg.message as string) || ''} onChange={(e) => onChange({ ...step, config: { ...cfg, message: e.target.value } })}
          placeholder="Message text" className="w-full px-3 py-2 text-sm rounded-lg resize-y focus:outline-none" style={inp} />
      )}
      {step.type === 'wait' && (
        <div className="flex items-center gap-2">
          <input type="number" value={(cfg.delay_minutes as string) || '0'}
            onChange={(e) => onChange({ ...step, config: { ...cfg, delay_minutes: e.target.value } })}
            className="w-24 px-3 py-1.5 text-sm rounded-lg focus:outline-none" style={inp} />
          <span className="text-sm" style={{ color: 'var(--wb-text-3)' }}>minutes</span>
        </div>
      )}
      {step.type === 'send_buttons' && (
        <div className="space-y-2">
          <input value={(cfg.body as string) || ''} onChange={(e) => onChange({ ...step, config: { ...cfg, body: e.target.value } })}
            placeholder="Message body above buttons" className="w-full px-3 py-1.5 text-sm rounded-lg focus:outline-none" style={inp} />
          {((cfg.buttons as string[]) || ['', '', '']).map((btn, bi) => (
            <input key={bi} value={btn} maxLength={20}
              onChange={(e) => { const b = [...((cfg.buttons as string[]) || ['', '', ''])]; b[bi] = e.target.value; onChange({ ...step, config: { ...cfg, buttons: b } }); }}
              placeholder={`Button ${bi + 1} label (max 20 chars)`} className="w-full px-3 py-1.5 text-sm rounded-lg focus:outline-none" style={inp} />
          ))}
        </div>
      )}
      {step.type === 'on_reply' && (
        <div className="space-y-2">
          {((cfg.branches as Array<{ match: string; message: string }>) || [{ match: '', message: '' }]).map((branch, bi) => (
            <div key={bi} className="grid grid-cols-2 gap-2">
              <input value={branch.match} placeholder="Match text"
                onChange={(e) => { const b = [...((cfg.branches as Array<{ match: string; message: string }>) || [])]; b[bi] = { ...b[bi], match: e.target.value }; onChange({ ...step, config: { ...cfg, branches: b } }); }}
                className="px-2 py-1.5 text-sm rounded-lg focus:outline-none" style={inp} />
              <input value={branch.message} placeholder="Reply message"
                onChange={(e) => { const b = [...((cfg.branches as Array<{ match: string; message: string }>) || [])]; b[bi] = { ...b[bi], message: e.target.value }; onChange({ ...step, config: { ...cfg, branches: b } }); }}
                className="px-2 py-1.5 text-sm rounded-lg focus:outline-none" style={inp} />
            </div>
          ))}
          <button onClick={() => onChange({ ...step, config: { ...cfg, branches: [...((cfg.branches as Array<{ match: string; message: string }>) || []), { match: '', message: '' }] } })}
            className="text-xs" style={{ color: 'var(--wb-accent)' }}>+ Add branch</button>
        </div>
      )}
      {step.type === 'update_stage' && (
        <input value={(cfg.stage as string) || ''} onChange={(e) => onChange({ ...step, config: { ...cfg, stage: e.target.value } })}
          placeholder="Stage name (e.g. qualified)" className="w-full px-3 py-1.5 text-sm rounded-lg focus:outline-none" style={inp} />
      )}
      {step.type === 'send_template' && (
        <input value={(cfg.template_name as string) || ''} onChange={(e) => onChange({ ...step, config: { ...cfg, template_name: e.target.value } })}
          placeholder="Template name" className="w-full px-3 py-1.5 text-sm rounded-lg focus:outline-none" style={inp} />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const flowId = params.id as string;

  const [flowName, setFlowName] = useState('');
  const [triggerType, setTriggerType] = useState('keyword');
  const [keywords, setKeywords] = useState('');
  const [messages, setMessages] = useState<string[]>(['']);
  const [advancedSteps, setAdvancedSteps] = useState<Step[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data: flow, isLoading } = useQuery<Flow>({
    queryKey: ['flow', flowId],
    queryFn: () => getFlow(activeWorkspace!.id, flowId),
    enabled: !!activeWorkspace && !!flowId,
  });

  useEffect(() => {
    if (!flow) return;
    setFlowName(flow.name);
    setTriggerType(flow.trigger?.type || 'keyword');
    setKeywords(flow.trigger?.keyword || '');
    const steps = (flow.flow_steps || []).sort((a, b) => a.position - b.position);
    const hasComplex = steps.some((s) => s.type !== 'send_message');
    if (hasComplex) {
      setShowAdvanced(true);
      setAdvancedSteps(steps.map((s) => ({ type: s.type, config: s.config || {} })));
    } else {
      const msgs = steps.map((s) => (s.config?.message as string) || '');
      setMessages(msgs.length > 0 ? msgs : ['']);
    }
    setDirty(false);
  }, [flow]);

  const mark = () => setDirty(true);

  const save = useMutation({
    mutationFn: async () => {
      await updateFlow(activeWorkspace!.id, flowId, {
        name: flowName,
        trigger_type: triggerType,
        trigger_config: triggerType === 'keyword' ? { keyword: keywords } : {},
      });
      const steps: Step[] = showAdvanced
        ? advancedSteps
        : messages.filter((m) => m.trim()).map((m) => ({ type: 'send_message', config: { message: m } }));
      await updateFlowSteps(activeWorkspace!.id, flowId, steps);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flow', flowId] });
      qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] });
      setDirty(false);
      toast.success('Flow saved');
    },
    onError: () => toast.error('Save failed'),
  });

  const toggleActive = useMutation({
    mutationFn: () => updateFlow(activeWorkspace!.id, flowId, { is_active: !flow?.is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flow', flowId] }); toast.success(flow?.is_active ? 'Flow paused' : 'Flow activated'); },
    onError: () => toast.error('Failed'),
  });

  const moveMsg = (from: number, to: number) => {
    if (to < 0 || to >= messages.length) return;
    const n = [...messages]; [n[from], n[to]] = [n[to], n[from]]; setMessages(n); mark();
  };

  if (isLoading) return <AppShell><div className="p-6 text-sm" style={{ color: 'var(--wb-text-3)' }}>Loading…</div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/flows')} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--wb-text-3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--wb-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <input value={flowName} onChange={(e) => { setFlowName(e.target.value); mark(); }}
            className="flex-1 text-lg font-semibold bg-transparent focus:outline-none border-b border-transparent focus:border-b"
            style={{ color: 'var(--wb-text)', borderColor: 'var(--wb-border)' }} placeholder="Flow name" />
          <div className="flex items-center gap-2 shrink-0">
            {dirty && <span className="text-xs" style={{ color: 'var(--wb-text-3)' }}>Unsaved</span>}
            <button onClick={() => toggleActive.mutate()}
              className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              style={flow?.is_active
                ? { background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }
                : { background: 'var(--wb-bg-hover)', color: 'var(--wb-text-3)' }}>
              {flow?.is_active ? '● Active' : '○ Paused'}
            </button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}
              className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs">
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Trigger */}
        <div className="rounded-xl p-4 mb-6 space-y-3" style={{ border: '1px solid var(--wb-border)', background: 'var(--wb-bg)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--wb-text-3)' }}>Trigger — when does this flow start?</p>
          <div className="flex gap-3">
            <select value={triggerType} onChange={(e) => { setTriggerType(e.target.value); mark(); }}
              className="rounded-lg px-3 py-2 text-sm focus:outline-none shrink-0" style={inp}>
              <option value="keyword">Keyword</option>
              <option value="new_contact">New Contact</option>
              <option value="stage_change">Stage Change</option>
            </select>
            {triggerType === 'keyword' && (
              <input value={keywords} onChange={(e) => { setKeywords(e.target.value); mark(); }}
                placeholder="hi, hello, start (comma-separated keywords)"
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none" style={inp} />
            )}
          </div>
        </div>

        {/* Simple message blocks */}
        {!showAdvanced && (
          <div className="space-y-4 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--wb-text-3)' }}>Messages — what WaBot sends</p>
            {messages.map((msg, i) => (
              <MessageBubble key={i} index={i} message={msg}
                onChange={(v) => { const n = [...messages]; n[i] = v; setMessages(n); mark(); }}
                onDelete={() => { setMessages(messages.filter((_, idx) => idx !== i)); mark(); }}
                onMoveUp={() => moveMsg(i, i - 1)} onMoveDown={() => moveMsg(i, i + 1)}
                isFirst={i === 0} isLast={i === messages.length - 1} />
            ))}
            <button onClick={() => { setMessages([...messages, '']); mark(); }}
              className="w-full rounded-xl py-3 text-sm flex items-center justify-center gap-2 border-2 border-dashed transition-colors"
              style={{ borderColor: 'var(--wb-border)', color: 'var(--wb-text-3)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--wb-accent)'; e.currentTarget.style.color = 'var(--wb-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--wb-border)'; e.currentTarget.style.color = 'var(--wb-text-3)'; }}>
              <Plus className="h-4 w-4" /> Add next message
            </button>
          </div>
        )}

        {/* Advanced steps */}
        {showAdvanced && (
          <div className="space-y-3 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--wb-text-3)' }}>Steps (Advanced mode)</p>
            {advancedSteps.map((step, i) => (
              <AdvancedStep key={i} step={step}
                onChange={(s) => { const n = [...advancedSteps]; n[i] = s; setAdvancedSteps(n); mark(); }}
                onDelete={() => { setAdvancedSteps(advancedSteps.filter((_, idx) => idx !== i)); mark(); }} />
            ))}
            <button onClick={() => { setAdvancedSteps([...advancedSteps, { type: 'send_message', config: { message: '' } }]); mark(); }}
              className="w-full rounded-xl py-3 text-sm flex items-center justify-center gap-2 border-2 border-dashed transition-colors"
              style={{ borderColor: 'var(--wb-border)', color: 'var(--wb-text-3)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--wb-accent)'; e.currentTarget.style.color = 'var(--wb-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--wb-border)'; e.currentTarget.style.color = 'var(--wb-text-3)'; }}>
              <Plus className="h-4 w-4" /> Add step
            </button>
          </div>
        )}

        {/* Advanced toggle */}
        <button
          onClick={() => {
            if (!showAdvanced) {
              setAdvancedSteps(messages.filter((m) => m.trim()).map((m) => ({ type: 'send_message', config: { message: m } })));
            } else {
              const msgs = advancedSteps.filter((s) => s.type === 'send_message').map((s) => (s.config.message as string) || '');
              setMessages(msgs.length > 0 ? msgs : ['']);
            }
            setShowAdvanced(!showAdvanced);
          }}
          className="text-xs hover:underline transition-opacity hover:opacity-80"
          style={{ color: 'var(--wb-text-3)' }}>
          {showAdvanced ? '← Back to simple mode' : 'Advanced options — buttons, delays, conditions →'}
        </button>
      </div>
    </AppShell>
  );
}
