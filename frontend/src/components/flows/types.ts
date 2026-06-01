// ── Node types ────────────────────────────────────────────────────────────────

export type NodeType = 'trigger' | 'message' | 'on_reply' | 'branch' | 'action' | 'payment';

export interface NodeTypeConfig {
  label: string;
  icon: string;
  bg: string;
  border: string;
  text: string;
}

export const NODE_TYPES: Record<NodeType, NodeTypeConfig> = {
  trigger:  { label: 'Trigger',   icon: '⚡', bg: '#E6F1FB', border: '#185FA5', text: '#185FA5' },
  message:  { label: 'Message',   icon: '💬', bg: '#E1F5EE', border: '#1D9E75', text: '#1D9E75' },
  on_reply: { label: 'On Reply',  icon: '↩',  bg: '#FAEEDA', border: '#BA7517', text: '#BA7517' },
  branch:   { label: 'Branch',    icon: '🔀', bg: '#FAECE7', border: '#993C1D', text: '#993C1D' },
  action:   { label: 'Action',    icon: '⚙',  bg: '#EEEDFE', border: '#534AB7', text: '#534AB7' },
  payment:  { label: 'Payment',   icon: '💰', bg: '#E1F5EE', border: '#1D9E75', text: '#1D9E75' },
};

// Dark mode overrides (bg darkened, border unchanged)
export const NODE_TYPES_DARK: Record<NodeType, Partial<NodeTypeConfig>> = {
  trigger:  { bg: 'rgba(24,95,165,0.15)' },
  message:  { bg: 'rgba(29,158,117,0.15)' },
  on_reply: { bg: 'rgba(186,117,23,0.15)' },
  branch:   { bg: 'rgba(153,60,29,0.15)' },
  action:   { bg: 'rgba(83,74,183,0.15)' },
  payment:  { bg: 'rgba(29,158,117,0.15)' },
};

export const NODE_W = 164;
export const NODE_H = 56;
export const H_GAP  = 80;   // horizontal gap between node columns
export const V_GAP  = 20;   // vertical gap between sibling nodes

// ── Canvas node ────────────────────────────────────────────────────────────────

export interface NodeConfig {
  message?:          string;
  trigger_keywords?: string;
  reply_contains?:   string;
  label?:            string;
  stage?:            string;
  // tree persistence (stored in DB step config)
  _local_id?:        string;
  _parent_local_id?: string | null;
  [key: string]: unknown;
}

export interface CanvasNode {
  id: string;         // local ID e.g. "n_abc123"
  dbId?: string;      // DB flow_step.id after saved
  type: NodeType;
  label: string;
  config: NodeConfig;
  parentId: string | null;
  childIds: string[];
  x: number;
  y: number;
}

// ── Raw API shapes ─────────────────────────────────────────────────────────────

export interface RawFlow {
  id: string;
  name: string;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  trigger?: { type: string; keyword?: string };
  is_active: boolean;
  flow_steps: RawStep[];
}

export interface RawStep {
  id: string;
  type: string;
  config: NodeConfig;
  position: number;
}

// ── AI generation ──────────────────────────────────────────────────────────────

export interface AIStep {
  type: string;
  label?: string;
  config: NodeConfig;
  children?: AIStep[];
}

export interface AIGeneratedFlow {
  name: string;
  trigger_keywords: string;
  steps: AIStep[];
}

// ── Tree helpers ───────────────────────────────────────────────────────────────

/** Assign local IDs and parent refs to every node in the map */
export function makeId(): string {
  return 'n_' + Math.random().toString(36).slice(2, 9);
}

export function subtreeHeight(nodeId: string, nodes: Record<string, CanvasNode>): number {
  const node = nodes[nodeId];
  if (!node || node.childIds.length === 0) return NODE_H;
  const total = node.childIds.reduce(
    (s, cid) => s + subtreeHeight(cid, nodes), 0
  );
  return Math.max(NODE_H, total + (node.childIds.length - 1) * V_GAP);
}

export function layoutNodes(
  rootIds: string[],
  nodes: Record<string, CanvasNode>
): Record<string, CanvasNode> {
  const out = { ...nodes };

  const totalH = rootIds.reduce((s, id) => s + subtreeHeight(id, out), 0)
    + Math.max(0, rootIds.length - 1) * V_GAP;
  let startY = -totalH / 2;

  function pos(id: string, x: number, topY: number) {
    const n = out[id];
    if (!n) return;
    const h = subtreeHeight(id, out);
    n.x = x;
    n.y = topY + h / 2 - NODE_H / 2;
    if (n.childIds.length === 0) return;
    const childX = x + NODE_W + H_GAP;
    const childrenH = n.childIds.reduce((s, cid) => s + subtreeHeight(cid, out), 0)
      + (n.childIds.length - 1) * V_GAP;
    let cy = n.y + NODE_H / 2 - childrenH / 2;
    for (const cid of n.childIds) {
      const ch = subtreeHeight(cid, out);
      pos(cid, childX, cy);
      cy += ch + V_GAP;
    }
  }

  for (const rid of rootIds) {
    const h = subtreeHeight(rid, out);
    pos(rid, 40, startY);
    startY += h + V_GAP;
  }

  return out;
}

// Map old backend step types to visual builder node types
const STEP_TYPE_MAP: Record<string, NodeType> = {
  send_message:  'message',
  send_template: 'message',
  wait:          'action',
  send_buttons:  'branch',
  update_stage:  'action',
};
const VALID_NODE_TYPES = new Set<string>(['trigger', 'message', 'on_reply', 'branch', 'action', 'payment']);

function normalizeStepType(t: string): NodeType {
  if (VALID_NODE_TYPES.has(t)) return t as NodeType;
  return STEP_TYPE_MAP[t] ?? 'message';
}

/** Build a node map + rootIds from flat DB steps */
export function stepsToNodes(steps: RawStep[]): {
  nodes: Record<string, CanvasNode>;
  rootIds: string[];
} {
  const nodes: Record<string, CanvasNode> = {};

  // First pass: create nodes
  for (const s of steps) {
    const cfg = s.config ?? {};
    const lid = (cfg._local_id as string) || `n_${s.id}`;
    nodes[lid] = {
      id: lid, dbId: s.id,
      type: normalizeStepType(s.type || 'message'),
      label: (cfg.label as string) || s.type || 'Step',
      config: { ...cfg },
      parentId: (cfg._parent_local_id as string) || null,
      childIds: [],
      x: 0, y: 0,
    };
  }

  // Second pass: link children, find roots
  const rootIds: string[] = [];
  for (const n of Object.values(nodes)) {
    if (n.parentId && nodes[n.parentId]) {
      if (!nodes[n.parentId].childIds.includes(n.id)) {
        nodes[n.parentId].childIds.push(n.id);
      }
    } else {
      n.parentId = null;
      if (!rootIds.includes(n.id)) rootIds.push(n.id);
    }
  }

  // Sort children by original position
  for (const n of Object.values(nodes)) {
    n.childIds.sort((a, b) => (nodes[a]?.config?.position as number ?? 0) - (nodes[b]?.config?.position as number ?? 0));
  }

  return { nodes, rootIds };
}

/** Flatten node map back to steps array for saving */
export function nodesToSteps(
  rootIds: string[],
  nodes: Record<string, CanvasNode>
): Array<{ type: string; config: NodeConfig }> {
  const steps: Array<{ type: string; config: NodeConfig }> = [];
  let position = 0;

  function visit(id: string) {
    const n = nodes[id];
    if (!n) return;
    steps.push({
      type: n.type,
      config: {
        ...n.config,
        label: n.label,
        _local_id: n.id,
        _parent_local_id: n.parentId ?? null,
        position,
      },
    });
    position++;
    for (const cid of n.childIds) visit(cid);
  }

  for (const rid of rootIds) visit(rid);
  return steps;
}

/** Create a brand-new flow with a single trigger root node */
export function emptyFlow(triggerKeywords = 'hi,hello'): { nodes: Record<string, CanvasNode>; rootIds: string[] } {
  const id = makeId();
  const node: CanvasNode = {
    id, type: 'trigger',
    label: 'Trigger', config: { trigger_keywords: triggerKeywords },
    parentId: null, childIds: [], x: 40, y: -28,
  };
  return { nodes: { [id]: node }, rootIds: [id] };
}
