'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize, Save, Sparkles } from 'lucide-react';
import { FlowNode } from './FlowNode';
import {
  NODE_W, NODE_H, H_GAP,
  type CanvasNode, type NodeType,
  makeId, layoutNodes,
} from './types';

interface Props {
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

export function FlowBuilder({
  flowName, nodes, rootIds, selectedNodeId, isSaved, isDark,
  onSelectNode, onNodesChange, onSave, onOpenAI, onNameChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 320 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(flowName);

  useEffect(() => { setNameValue(flowName); }, [flowName]);

  // ── Zoom ────────────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPan({ x: mx - (mx - pan.x) * (newZoom / zoom), y: my - (my - pan.y) * (newZoom / zoom) });
    setZoom(newZoom);
  }, [zoom, pan]);

  const zoomTo = (z: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.width / 2, cy = rect.height / 2;
    setPan({ x: cx - (cx - pan.x) * (z / zoom), y: cy - (cy - pan.y) * (z / zoom) });
    setZoom(z);
  };

  const fitView = useCallback(() => {
    const ns = Object.values(nodes);
    if (!ns.length || !svgRef.current) return;
    const minX = Math.min(...ns.map((n) => n.x));
    const maxX = Math.max(...ns.map((n) => n.x + NODE_W));
    const minY = Math.min(...ns.map((n) => n.y));
    const maxY = Math.max(...ns.map((n) => n.y + NODE_H));
    const rect = svgRef.current.getBoundingClientRect();
    const pad = 60;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
      Math.min((rect.width - pad * 2) / (maxX - minX + 1), (rect.height - pad * 2 - 48) / (maxY - minY + 1))
    ));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    setPan({ x: rect.width / 2 - cx * z, y: rect.height / 2 - cy * z + 24 });
    setZoom(z);
  }, [nodes]);

  // ── Pan ────────────────────────────────────────────────────────────────────

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

  // ── Node operations ────────────────────────────────────────────────────────

  const addChild = useCallback((parentId: string, type: NodeType) => {
    const newId = makeId();
    const parent = nodes[parentId];
    if (!parent) return;

    const newNode: CanvasNode = {
      id: newId, type, label: NODE_TYPE_DEFAULTS[type].label,
      config: { ...NODE_TYPE_DEFAULTS[type].config },
      parentId, childIds: [],
      x: parent.x + NODE_W + H_GAP, y: parent.y,
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

  // ── Edges ────────────────────────────────────────────────────────────────

  const edges = useMemo(() => {
    const result: { id: string; d: string }[] = [];
    for (const n of Object.values(nodes)) {
      for (const cid of n.childIds) {
        const child = nodes[cid];
        if (!child) continue;
        const x1 = n.x + NODE_W;
        const y1 = n.y + NODE_H / 2;
        const x2 = child.x;
        const y2 = child.y + NODE_H / 2;
        const cx = (x1 + x2) / 2;
        result.push({ id: `${n.id}-${cid}`, d: `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}` });
      }
    }
    return result;
  }, [nodes]);

  const canvasColor = isDark ? '#1a1a1a' : '#f8f8f8';
  const dotColor   = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
  const edgeColor  = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';

  const dotX = ((pan.x % (DOT_SPACING * zoom)) + DOT_SPACING * zoom) % (DOT_SPACING * zoom);
  const dotY = ((pan.y % (DOT_SPACING * zoom)) + DOT_SPACING * zoom) % (DOT_SPACING * zoom);

  return (
    <div className="flex flex-col h-full" style={{ background: canvasColor }}>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0 z-10"
        style={{ borderBottom: `1px solid ${isDark ? 'var(--wb-border)' : '#e5e5e5'}`, background: isDark ? 'var(--wb-bg-card)' : '#fff' }}>

        {/* Flow name */}
        {editingName ? (
          <input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => { if (nameValue.trim()) { onNameChange(nameValue.trim()); setEditingName(false); } else setEditingName(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (nameValue.trim()) { onNameChange(nameValue.trim()); setEditingName(false); } } if (e.key === 'Escape') setEditingName(false); }}
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

        {/* Status badge */}
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={isSaved
            ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
            : { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
          {isSaved ? '● Saved' : '● Unsaved'}
        </span>

        <div className="flex-1" />

        {/* AI button */}
        <button onClick={onOpenAI}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#f59e0b' }}>
          <Sparkles className="h-3.5 w-3.5" />Generate with AI
        </button>

        {/* Save button */}
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
            {/* Dot pattern */}
            <pattern id="dots" x={dotX} y={dotY} width={DOT_SPACING * zoom} height={DOT_SPACING * zoom} patternUnits="userSpaceOnUse">
              <circle cx={1.5} cy={1.5} r={1.5} fill={dotColor} />
            </pattern>
            {/* Arrow marker */}
            <marker id="arrow" markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill={edgeColor} />
            </marker>
          </defs>

          {/* Background dots */}
          <rect width="100%" height="100%" fill="url(#dots)" />

          {/* Canvas content */}
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((e) => (
              <path key={e.id} d={e.d} fill="none" stroke={edgeColor} strokeWidth={1.5}
                strokeDasharray="none" markerEnd="url(#arrow)" />
            ))}

            {/* Nodes */}
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
            { icon: <Maximize className="h-3.5 w-3.5" />, action: fitView, title: 'Fit view' },
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

        {/* Node type legend */}
        <div className="absolute bottom-4 left-4 flex gap-1.5 flex-wrap max-w-xs">
          {(['trigger','message','on_reply','branch','action'] as NodeType[]).map((t) => {
            const c = NODE_TYPES[t];
            return (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: isDark ? `${c.border}22` : c.bg, color: c.text, border: `1px solid ${c.border}44` }}>
                {c.icon} {c.label}
              </span>
            );
          })}
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
};

// Re-export for use in FlowNode
export { NODE_TYPES_DARK } from './types';
import { NODE_TYPES } from './types';
export { NODE_TYPES };
