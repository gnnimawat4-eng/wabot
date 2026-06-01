'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Check, ChevronDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { AIGeneratedFlow, CanvasNode } from './types';
import { makeId, layoutNodes } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const BIZ_TYPES = [
  'Restaurant / Cafe', 'Hotel', 'Real Estate',
  'Clinic / Hospital', 'Coaching / Education',
  'E-commerce / Shop', 'Salon / Spa', 'Custom',
];

const COUNT_OPTIONS = [
  { value: '1',     label: '1 flow' },
  { value: '3',     label: '3 flows' },
  { value: '5',     label: '5 flows' },
  { value: 'full',  label: 'Full set' },
];

interface Props {
  workspaceId: string;
  onImport: (nodes: Record<string, CanvasNode>, rootIds: string[]) => void;
  onClose: () => void;
}

interface GeneratedFlow extends AIGeneratedFlow {
  selected: boolean;
  stepCount: number;
}

export function AIGenerator({ workspaceId, onImport, onClose }: Props) {
  const [step, setStep] = useState<'form' | 'loading' | 'preview'>('form');
  const [bizName, setBizName] = useState('');
  const [bizType, setBizType] = useState('Restaurant / Cafe');
  const [description, setDescription] = useState('');
  const [count, setCount] = useState('3');
  const [flows, setFlows] = useState<GeneratedFlow[]>([]);
  const [wasTruncated, setWasTruncated] = useState(false);

  const generate = async () => {
    if (!description.trim()) { toast.error('Please describe what this flow should do'); return; }
    setStep('loading');
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/ai/generate-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessName: bizName, businessType: bizType, description: description.trim(), count }),
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Generation failed'); }
      const data = await res.json();
      // Backend enforces single flow; take only first as a safety net
      const rawFlows: AIGeneratedFlow[] = data.flows || [];
      const single = rawFlows.slice(0, 1);
      const parsed: GeneratedFlow[] = single.map((f: AIGeneratedFlow) => ({
        ...f,
        selected: true,
        stepCount: countSteps(f.steps || []),
      }));
      if (!parsed.length) throw new Error('No flows returned. Try again.');
      setWasTruncated(rawFlows.length > 1);
      setFlows(parsed);
      setStep('preview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI generation failed';
      toast.error(msg === 'signal timed out' ? 'AI is taking too long. Try again.' : msg);
      setStep('form');
    }
  };

  function countSteps(steps: AIGeneratedFlow['steps']): number {
    return steps.reduce((n, s) => n + 1 + countSteps((s.children || []) as AIGeneratedFlow['steps']), 0);
  }

  function aiStepsToNodes(steps: AIGeneratedFlow['steps']): {
    nodes: Record<string, CanvasNode>; rootIds: string[];
  } {
    const nodes: Record<string, CanvasNode> = {};
    const rootIds: string[] = [];

    // If the AI returned branch nodes at the top level instead of nesting them
    // inside an on_reply, collapse them under a synthetic on_reply so the tree
    // is always connected to a single root.
    const topBranches = steps.filter((s) => s.type === 'branch');
    const nonBranch   = steps.filter((s) => s.type !== 'branch');
    let normalised = nonBranch;
    if (topBranches.length > 0) {
      const hasOnReply = nonBranch.some((s) => s.type === 'on_reply');
      if (!hasOnReply) {
        // Wrap orphaned branches in a synthetic on_reply
        normalised = [
          ...nonBranch,
          { type: 'on_reply', label: 'Wait for reply', config: { message: 'Please choose an option:' }, children: topBranches },
        ];
      } else {
        // Append branches to the first on_reply found
        normalised = nonBranch.map((s) => {
          if (s.type === 'on_reply' && (!s.children || s.children.length === 0)) {
            return { ...s, children: topBranches };
          }
          return s;
        });
      }
    }

    function add(s: AIGeneratedFlow['steps'][0], parentId: string | null) {
      const id = makeId();
      const nodeType = (['trigger','message','on_reply','branch','action'].includes(s.type) ? s.type : 'message') as CanvasNode['type'];
      nodes[id] = {
        id, type: nodeType,
        label: s.label || s.type || 'Step',
        config: { ...s.config },
        parentId, childIds: [],
        x: 0, y: 0,
      };
      if (parentId && nodes[parentId]) nodes[parentId].childIds.push(id);
      else rootIds.push(id);
      for (const c of s.children || []) add(c, id);
    }

    for (const s of normalised) add(s, null);
    return { nodes: layoutNodes(rootIds, nodes), rootIds };
  }

  const doImport = () => {
    const selected = flows.filter((f) => f.selected);
    if (!selected.length) { toast.error('Select at least one flow'); return; }

    // Merge all selected flows' nodes
    const allNodes: Record<string, CanvasNode> = {};
    const allRoots: string[] = [];
    let offset = 0;

    for (const f of selected) {
      const { nodes, rootIds } = aiStepsToNodes(f.steps || []);
      // Add trigger node at the top
      const triggerId = makeId();
      const kw = f.trigger_keywords || 'hi,hello';
      nodes[triggerId] = {
        id: triggerId, type: 'trigger',
        label: f.name || 'Trigger',
        config: { trigger_keywords: kw },
        parentId: null, childIds: rootIds,
        x: 0, y: 0,
      };
      for (const rid of rootIds) { if (nodes[rid]) nodes[rid].parentId = triggerId; }
      const roots = [triggerId];

      // Offset nodes vertically so they don't overlap
      for (const n of Object.values(nodes)) { n.y += offset; }
      offset += 300;

      Object.assign(allNodes, nodes);
      allRoots.push(...roots);
    }

    const laid = layoutNodes(allRoots, allNodes);
    onImport(laid, allRoots);
    toast.success(`${selected.length} flow${selected.length > 1 ? 's' : ''} imported into canvas!`);
    onClose();
  };

  const inpStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    background: 'var(--wb-input)', border: '1px solid var(--wb-input-border)', color: 'var(--wb-text)',
    outline: 'none',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--wb-border)' }}>
          <Sparkles className="h-5 w-5 text-yellow-400" />
          <h2 className="text-base font-semibold" style={{ color: 'var(--wb-text)' }}>Generate flow with AI</h2>
          <button onClick={onClose} className="ml-auto text-sm px-2 py-0.5 rounded hover:bg-white/5"
            style={{ color: 'var(--wb-text-3)' }}>✕</button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>

          {/* Form */}
          {step === 'form' && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>Business name</label>
                  <input style={inpStyle} value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="e.g. Spice Garden" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>Business type</label>
                  <div className="relative">
                    <select style={{ ...inpStyle, appearance: 'none', paddingRight: 28 }}
                      value={bizType} onChange={(e) => setBizType(e.target.value)}>
                      {BIZ_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--wb-text-3)' }} />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>
                  What should this flow do?
                </label>
                <textarea rows={4} style={{ ...inpStyle, resize: 'none' }}
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Help customers view menu, book a table, ask about timings and location" />
              </div>

              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--wb-text-2)' }}>Number of flows</label>
                <div className="flex gap-2">
                  {COUNT_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" value={o.value} checked={count === o.value}
                        onChange={() => setCount(o.value)} className="accent-green-500" />
                      <span className="text-sm" style={{ color: 'var(--wb-text)' }}>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button onClick={generate}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-white"
                style={{ background: 'var(--wb-accent)' }}>
                <Sparkles className="h-4 w-4" />Generate Flows
              </button>
            </div>
          )}

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <Loader2 className="h-10 w-10 text-yellow-400 animate-spin" />
                <Sparkles className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1" />
              </div>
              <div className="text-center">
                <p className="font-semibold" style={{ color: 'var(--wb-text)' }}>AI is generating your flows…</p>
                <p className="text-sm mt-1" style={{ color: 'var(--wb-text-3)' }}>This may take up to 30 seconds</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {step === 'preview' && (
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium" style={{ color: 'var(--wb-text)' }}>
                  Flow generated
                </p>
                <button onClick={() => setStep('form')}
                  className="text-xs underline" style={{ color: 'var(--wb-text-3)' }}>← Regenerate</button>
              </div>

              {wasTruncated && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  AI returned multiple flows — only the first connected flow will be imported.
                </div>
              )}

              {flows.map((f, i) => (
                <label key={i} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                  style={{ background: f.selected ? 'var(--wb-bg-active)' : 'var(--wb-bg-hover)', border: `1px solid ${f.selected ? 'var(--wb-accent)' : 'transparent'}` }}>
                  <div className={`mt-0.5 h-5 w-5 rounded flex items-center justify-center shrink-0 transition-colors ${f.selected ? 'bg-green-500' : 'border border-white/20'}`}>
                    {f.selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </div>
                  <input type="checkbox" className="sr-only" checked={f.selected}
                    onChange={() => setFlows(flows.map((fl, j) => j === i ? { ...fl, selected: !fl.selected } : fl))} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>{f.name}</p>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {(f.trigger_keywords || '').split(',').filter(Boolean).slice(0, 4).map((kw) => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>
                          {kw.trim()}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--wb-text-3)' }}>{f.stepCount} step{f.stepCount !== 1 ? 's' : ''}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div className="px-5 py-4 flex gap-2" style={{ borderTop: '1px solid var(--wb-border)' }}>
            <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm"
              style={{ border: '1px solid var(--wb-border)', color: 'var(--wb-text-2)' }}>
              Cancel
            </button>
            <button onClick={doImport}
              disabled={!flows.length}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm text-white font-semibold disabled:opacity-40"
              style={{ background: 'var(--wb-accent)' }}>
              <Check className="h-4 w-4" />
              Import Flow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

async function getToken(): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await sb.auth.getSession();
  if (!data.session?.access_token) throw new Error('Not authenticated');
  return data.session.access_token;
}
