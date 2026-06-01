'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize, Save, Sparkles } from 'lucide-react';
import { FlowNode } from './FlowNode';
import {
  NODE_W, NODE_H, V_GAP,
  NODE_TYPES, NODE_TYPES_DARK,
  type CanvasNode, type NodeType,
  makeId, layoutNodes,
} from './types';

interface Props {
  flowId: string;
  flowName: string;
  nodes: Record<string, CanvasNode>;
  rootIds: string[];
  selectedNodeId: string | null;
  isSaved: boolean;
  isDark: boolean;
  onSelectNode: (id: string | null) => void;
  onNodesChange: (nodes: Record<string, CanvasNode>, rootIds: string[]) => void;
  onSave: () => void;
  onOpenAI: () => void;
  onNameChange: (name: string) => void;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const DOT_SPACING = 28;
const lsKey = (id: string) => `wabot-flow-view-${id}`;

export function FlowBuilder({
  flowId, flowName, nodes, rootIds, selectedNodeId, isSaved, isDark,
  onSelectNode, onNodesChange, onSave, onOpenAI, onNameChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 300, y: 60 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(flowName);

  useEffect(() => { setNameValue(flowName); }, [flowName]);

  // ── Fit view ──────────────────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    const ns = Object.values(nodes);
    if (!ns.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Single node: center at 100% — never zoom in on one lonely node
    if (ns.length === 1) {
      setZoom(1.0);
      setPan({ x: rect.width / 2 - NODE_W / 2, y: 60 });
      return;
    }

    const minX = Math.min(...ns.map((n) => n.x));
    const maxX = Math.max(...ns.map((n) => n.x + NODE_W));
    const minY = Math.min(...ns.map((n) => n.y));
    const maxY = Math.max(...ns.map((n) => n.y + NODE_H));
    const pad = 60;
    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    // Never exceed 100% on auto-fit — only zoom out to fit, never zoom in
    const z = Math.min(1.0, Math.max(MIN_ZOOM,
      Math.min((rect.width - pad * 2) / contentW, (rect.height - pad * 2) / contentH)
    ));
    setPan({ x: rect.width / 2 - ((minX + maxX) / 2) * z, y: rect.height / 2 - ((minY + maxY) / 2) * z });
    setZoom(z);
  }, [nodes]);

  // ── Zoom ──────────────────────────────────────────────────────────────────────

  const zoomTo = useCallback((z: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.width / 2, cy = rect.height / 2;
    setPan((prev) => ({ x: cx - (cx - prev.x) * (z / zoom), y: cy - (cy - prev.y) * (z / zoom) }));
    setZoom(z);
  }, [zoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPan((prev) => ({ x: mx - (mx - prev.x) * (newZoom / zoom), y: my - (my - prev.y) * (newZoom / zoom) }));
    setZoom(newZoom);
  }, [zoom]);

  // ── Auto-fit on mount and when nodes first populate ───────────────────────────
  // Always fit on mount so stale localStorage positions (e.g. from the old
  // horizontal layout) never place nodes off-screen. Use a 120 ms timeout so
  // the SVG has been painted and getBoundingClientRect() returns real dimensions.

  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  useEffect(() => {
    const t = setTimeout(() => fitViewRef.current(), 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // Also re-fit whenever the set of nodes changes from empty → populated
  // (covers AI-import where nodes arrive after mount).
  const prevNodeCountRef = useRef(Object.keys(nodes).length);
  useEffect(() => {
    const count = Object.keys(nodes).length;
    if (prevNodeCountRef.current === 0 && count > 0) {
      setTimeout(() => fitViewRef.current(), 60);
    }
    prevNodeCountRef.current = count;
  }, [nodes]);

  // ── Keyboard shortcuts: F = fit view, R = reset to 100% centered ─────────────

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        fitViewRef.current();
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const ns = Object.values(nodesRef.current);
        if (!ns.length || !svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const minX = Math.min(...ns.map((n) => n.x));
        const maxX = Math.max(...ns.map((n) => n.x + NODE_W));
        const minY = Math.min(...ns.map((n) => n.y));
        const maxY = Math.max(...ns.map((n) => n.y + NODE_H));
        setPan({ x: rect.width / 2 - ((minX + maxX) / 2), y: rect.height / 2 - ((minY + maxY) / 2) });
        setZoom(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // register once — functions accessed via refs

  // ── Pan ───────────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('.flow-node')) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + e.clientX - panStart.current.x,
      y: panStart.current.panY + e.clientY - panStart.current.y,
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // ── Node operations ───────────────────────────────────────────────────────────

  const addChild = useCallback((parentId: string, type: NodeType) => {
    const newId = makeId();
    const parent = nodes[parentId];
    if (!parent) return;
    const newNode: CanvasNode = {
      id: newId, type, label: NODE_TYPE_DEFAULTS[type].label,
      config: { ...NODE_TYPE_DEFAULTS[type].config },
      parentId, childIds: [],
      x: parent.x, y: parent.y + NODE_H + V_GAP,
    };
    const updated = {
      ...nodes,
      [parentId]: { ...parent, childIds: [...parent.childIds, newId] },
      [newId]: newNode,
    };
    const laid = layoutNodes(rootIds, updated);
    onNodesChange(laid, rootIds);
    onSelectNode(newId);
  }, [nodes, rootIds, onNodesChange, onSelectNode]);

  // ── Edges ─────────────────────────────────────────────────────────────────────

  const edges = useMemo(() => {
    const result: { id: string; d: string }[] = [];
    for (const n of Object.values(nodes)) {
      for (const cid of n.childIds) {
        const child = nodes[cid];
        if (!child) continue;
        // Bottom-center of parent → top-center of child
        const x1 = n.x + NODE_W / 2;
        const y1 = n.y + NODE_H;
        const x2 = child.x + NODE_W / 2;
        const y2 = child.y;
        const cy = (y1 + y2) / 2;
        result.push({ id: `${n.id}-${cid}`, d: `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}` });
      }
    }
    return result;
  }, [nodes]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const canvasColor = isDark ? '#1a1a1a' : '#f8f8f8';
  const dotColor    = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
  const edgeColor   = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
  const dotX = ((pan.x % (DOT_SPACING * zoom)) + DOT_SPACING * zoom) % (DOT_SPACING * zoom);
  const dotY = ((pan.y % (DOT_SPACING * zoom)) + DOT_SPACING * zoom) % (DOT_SPACING * zoom);

  return (
    <div className="flex flex-col h-full" style={{ background: canvasColor }}>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0 z-10"
        style={{ borderBottom: `1px solid ${isDark ? 'var(--wb-border)' : '#e5e5e5'}`, background: isDark ? 'var(--wb-bg-card)' : '#fff' }}>

        {editingName ? (
          <input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => { if (nameValue.trim()) { onNameChange(nameValue.trim()); setEditingName(false); } else setEditingName(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && nameValue.trim()) { onNameChange(nameValue.trim()); setEditingName(false); } if (e.key === 'Escape') setEditingName(false); }}
            className="text-sm font-semibold px-2 py-1 rounded focus:outline-none"
            style={{ color: 'var(--wb-text)', background: 'var(--wb-input)', border: '1px solid var(--wb-accent)', minWidth: 140 }}
          />
        ) : (
          <button onClick={() => setEditingName(true)}
            className="text-sm font-semibold px-2 py-1 rounded hover:bg-white/5 truncate max-w-[200px]"
            style={{ color: 'var(--wb-text)' }} title="Click to rename">
            {flowName || 'Untitled Flow'}
          </button>
        )}

        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={isSaved
            ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
            : { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
          {isSaved ? '● Saved' : '● Unsaved'}
        </span>

        <div className="flex-1" />

        <button onClick={onOpenAI}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#f59e0b' }}>
          <Sparkles className="h-3.5 w-3.5" />Generate with AI
        </button>

        <button onClick={onSave}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors hover:opacity-90"
          style={{ background: 'var(--wb-accent)' }}>
          <Save className="h-3.5 w-3.5" />Save Flow
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          style={{ width: '100%', height: '100%', cursor: isPanning ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onClick={() => onSelectNode(null)}
        >
          <defs>
            <pattern id="dots" x={dotX} y={dotY} width={DOT_SPACING * zoom} height={DOT_SPACING * zoom} patternUnits="userSpaceOnUse">
              <circle cx={1.5} cy={1.5} r={1.5} fill={dotColor} />
            </pattern>
            <marker id="arrow" markerWidth={8} markerHeight={8} refX={4} refY={4} orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill={edgeColor} />
            </marker>
          </defs>

          <rect width="100%" height="100%" fill="url(#dots)" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {edges.map((e) => (
              <path key={e.id} d={e.d} fill="none" stroke={edgeColor} strokeWidth={1.5} markerEnd="url(#arrow)" />
            ))}
            {Object.values(nodes).map((node) => (
              <g key={node.id} className="flow-node">
                <FlowNode
                  node={node}
                  selected={node.id === selectedNodeId}
                  isDark={isDark}
                  onSelect={onSelectNode}
                  onAddChild={addChild}
                />
              </g>
            ))}
          </g>
        </svg>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1">
          {[
            { icon: <ZoomIn className="h-3.5 w-3.5" />, action: () => zoomTo(Math.min(MAX_ZOOM, zoom * 1.2)), title: 'Zoom in' },
            { icon: <ZoomOut className="h-3.5 w-3.5" />, action: () => zoomTo(Math.max(MIN_ZOOM, zoom * 0.8)), title: 'Zoom out' },
            { icon: <Maximize className="h-3.5 w-3.5" />, action: fitView, title: 'Fit view (F)' },
          ].map(({ icon, action, title }) => (
            <button key={title} onClick={action} title={title}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors shadow-sm"
              style={{ background: isDark ? 'var(--wb-bg-card)' : '#fff', border: '1px solid var(--wb-border)', color: 'var(--wb-text-2)' }}>
              {icon}
            </button>
          ))}
          <div className="h-8 flex items-center justify-center text-xs font-mono"
            style={{ color: 'var(--wb-text-3)' }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Node type legend + keyboard hint */}
        <div className="absolute bottom-4 left-4 flex gap-1.5 flex-wrap max-w-sm">
          {(['trigger', 'message', 'on_reply', 'branch', 'action'] as NodeType[]).map((t) => {
            const c = NODE_TYPES[t];
            return (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: isDark ? `${c.border}22` : c.bg, color: c.text, border: `1px solid ${c.border}44` }}>
                {c.icon} {c.label}
              </span>
            );
          })}
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f0f0f0', color: isDark ? '#666' : '#999', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e0e0e0'}` }}>
            F = fit · R = 100%
          </span>
        </div>

        {/* Empty state */}
        {Object.keys(nodes).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center opacity-40">
              <p className="text-sm" style={{ color: 'var(--wb-text)' }}>Click "+" on a node to add steps</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Default config per node type
const NODE_TYPE_DEFAULTS: Record<NodeType, { label: string; config: Record<string, unknown> }> = {
  trigger:  { label: 'Trigger',  config: { trigger_keywords: '' } },
  message:  { label: 'Message',  config: { message: '' } },
  on_reply: { label: 'On Reply', config: { message: '' } },
  branch:   { label: 'Branch',   config: { reply_contains: '', message: '' } },
  action:   { label: 'Action',   config: { stage: '' } },
  payment:  { label: 'Payment',  config: { amount: '', amount_type: 'fixed' } },
};
