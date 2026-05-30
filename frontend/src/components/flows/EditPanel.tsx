'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus, ChevronDown } from 'lucide-react';
import { NODE_TYPES, type CanvasNode, type NodeType, type NodeConfig } from './types';

interface Props {
  node: CanvasNode;
  isDark: boolean;
  onUpdate: (id: string, updates: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string, type: NodeType) => void;
}

const ALL_TYPES: NodeType[] = ['trigger', 'message', 'on_reply', 'branch', 'action'];

const inp = 'w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-green-500/40';

export function EditPanel({ node, isDark, onUpdate, onDelete, onAddChild }: Props) {
  const [label, setLabel] = useState(node.label);
  const [config, setConfig] = useState<NodeConfig>({ ...node.config });
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync when selected node changes
  useEffect(() => {
    setLabel(node.label);
    setConfig({ ...node.config });
    setConfirmDelete(false);
  }, [node.id]);

  const inpStyle: React.CSSProperties = {
    background: isDark ? 'var(--wb-input)' : '#fff',
    borderColor: isDark ? 'var(--wb-input-border)' : '#e0e0e0',
    color: 'var(--wb-text)',
  };

  const commit = (updates: Partial<Pick<CanvasNode, 'label' | 'config' | 'type'>>) => {
    onUpdate(node.id, updates);
  };

  const setLabel_ = (v: string) => { setLabel(v); commit({ label: v }); };
  const setMsg = (v: string) => { const c = { ...config, message: v }; setConfig(c); commit({ config: c }); };
  const setKeywords = (v: string) => { const c = { ...config, trigger_keywords: v }; setConfig(c); commit({ config: c }); };
  const setReply = (v: string) => { const c = { ...config, reply_contains: v }; setConfig(c); commit({ config: c }); };
  const setStage = (v: string) => { const c = { ...config, stage: v }; setConfig(c); commit({ config: c }); };
  const setType = (t: NodeType) => { commit({ type: t }); setShowTypePicker(false); };

  const typeCfg = NODE_TYPES[node.type] ?? NODE_TYPES.message;
  const borderCol = isDark ? 'var(--wb-border)' : '#e5e5e5';
  const bg = isDark ? 'var(--wb-bg-card)' : '#fff';

  return (
    <div className="flex flex-col h-full overflow-y-auto"
      style={{ width: 300, minWidth: 300, borderLeft: `1px solid ${borderCol}`, background: bg }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 shrink-0"
        style={{ borderBottom: `1px solid ${borderCol}` }}>
        <span className="text-base">{typeCfg.icon}</span>
        <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--wb-text)' }}>
          {label || 'Edit Node'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Type picker */}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>Node Type</label>
          <div className="relative">
            <button
              onClick={() => setShowTypePicker(!showTypePicker)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left"
              style={{ background: isDark ? 'var(--wb-input)' : '#f9f9f9', border: `1px solid ${isDark ? 'var(--wb-input-border)' : '#e0e0e0'}`, color: 'var(--wb-text)' }}>
              <span>{typeCfg.icon} {typeCfg.label}</span>
              <ChevronDown className="h-3.5 w-3.5 ml-auto" style={{ color: 'var(--wb-text-3)' }} />
            </button>
            {showTypePicker && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg shadow-lg overflow-hidden"
                style={{ background: bg, border: `1px solid ${borderCol}` }}>
                {ALL_TYPES.map((t) => {
                  const c = NODE_TYPES[t];
                  return (
                    <button key={t} onClick={() => setType(t)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
                      style={{ color: c.text, background: node.type === t ? (isDark ? `${c.border}22` : c.bg) : undefined }}>
                      {c.icon} {c.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Label */}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>Label</label>
          <input className={inp} style={inpStyle} value={label}
            onChange={(e) => setLabel_(e.target.value)} placeholder="Node label" />
        </div>

        {/* Trigger keywords */}
        {node.type === 'trigger' && (
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>
              Trigger Keywords <span className="text-[10px] font-normal opacity-60">(comma separated)</span>
            </label>
            <input className={inp} style={inpStyle}
              value={config.trigger_keywords || ''} onChange={(e) => setKeywords(e.target.value)}
              placeholder="hi, hello, hey, start" />
            <p className="text-[10px] mt-1" style={{ color: 'var(--wb-text-3)' }}>
              Flow starts when customer sends any of these words.
            </p>
          </div>
        )}

        {/* Message */}
        {(node.type === 'message' || node.type === 'on_reply') && (
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>Message</label>
            <textarea rows={5} className={`${inp} resize-none`} style={inpStyle}
              value={config.message || ''} onChange={(e) => setMsg(e.target.value)}
              placeholder="Type the message the bot will send…" />
          </div>
        )}

        {/* Branch: reply_contains + message */}
        {node.type === 'branch' && (
          <>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>
                Reply Contains <span className="text-[10px] font-normal opacity-60">(what customer types)</span>
              </label>
              <input className={inp} style={inpStyle}
                value={config.reply_contains || ''} onChange={(e) => setReply(e.target.value)}
                placeholder='e.g. "1" or "book" or "yes"' />
              <p className="text-[10px] mt-1" style={{ color: 'var(--wb-text-3)' }}>
                This branch triggers when the reply includes this text.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>Response Message</label>
              <textarea rows={4} className={`${inp} resize-none`} style={inpStyle}
                value={config.message || ''} onChange={(e) => setMsg(e.target.value)}
                placeholder="Reply sent when this branch matches…" />
            </div>
          </>
        )}

        {/* Action: stage */}
        {node.type === 'action' && (
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--wb-text-2)' }}>
              Update Stage To
            </label>
            <input className={inp} style={inpStyle}
              value={config.stage || ''} onChange={(e) => setStage(e.target.value)}
              placeholder="e.g. qualified, booked, closed" />
          </div>
        )}

        <hr style={{ borderColor: borderCol }} />

        {/* Add child */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--wb-text-2)' }}>Add child node</p>
          <div className="flex flex-wrap gap-1.5">
            {(['message','on_reply','branch','action'] as NodeType[]).map((t) => {
              const c = NODE_TYPES[t];
              return (
                <button key={t} onClick={() => onAddChild(node.id, t)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ background: isDark ? `${c.border}18` : c.bg, color: c.text, border: `1px solid ${c.border}40` }}>
                  <Plus className="h-3 w-3" />{c.label}
                </button>
              );
            })}
          </div>
        </div>

        <hr style={{ borderColor: borderCol }} />

        {/* Delete */}
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            className="w-full flex items-center justify-center gap-2 text-sm py-2 rounded-lg transition-colors text-red-400 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" />Delete Node
          </button>
        ) : (
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-xs text-red-400 text-center">Delete this node and all its children?</p>
            <div className="flex gap-2">
              <button onClick={() => onDelete(node.id)}
                className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600">Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 text-xs py-1.5 rounded-lg hover:bg-white/5" style={{ color: 'var(--wb-text-3)', border: `1px solid ${borderCol}` }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
