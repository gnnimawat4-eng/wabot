import React, { memo, useState } from 'react';
import { NODE_TYPES, NODE_TYPES_DARK, NODE_W, NODE_H, type CanvasNode, type NodeType } from './types';

const TYPE_PICKER_TYPES: NodeType[] = ['message', 'on_reply', 'branch', 'action'];

interface Props {
  node: CanvasNode;
  selected: boolean;
  isDark: boolean;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string, type: NodeType) => void;
}

export const FlowNode = memo(function FlowNode({ node, selected, isDark, onSelect, onAddChild }: Props) {
  const [hover, setHover] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const cfg = NODE_TYPES[node.type];
  const darkCfg = NODE_TYPES_DARK[node.type];
  const bg = isDark ? darkCfg.bg! : cfg.bg;
  const border = cfg.border;
  const textColor = cfg.text;

  const label = node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label;
  const typeLabel = cfg.icon + ' ' + cfg.label;

  const PICKER_H = TYPE_PICKER_TYPES.length * 34 + 8;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); }}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); setShowPicker(false); }}
    >
      {/* Drop shadow for selected */}
      {selected && (
        <rect
          x={-2} y={-2} width={NODE_W + 4} height={NODE_H + 4}
          rx={11} fill="none" stroke={border} strokeWidth={2} opacity={0.6}
        />
      )}

      {/* Main rect */}
      <rect
        width={NODE_W} height={NODE_H} rx={9}
        fill={bg}
        stroke={selected ? border : hover ? border : 'rgba(0,0,0,0.08)'}
        strokeWidth={selected ? 2 : 1}
        style={{ transition: 'stroke 0.1s' }}
      />

      {/* Type icon + label */}
      <text x={10} y={21} fontSize={12} fontWeight={600} fill={textColor}>
        {label}
      </text>
      <text x={10} y={38} fontSize={10} fill={textColor} opacity={0.65}>
        {typeLabel}
      </text>

      {/* "+" button on right */}
      <g
        transform={`translate(${NODE_W - 14}, ${NODE_H / 2 - 10})`}
        onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
        style={{ cursor: 'pointer' }}
      >
        <circle cx={10} cy={10} r={10} fill={border} opacity={hover || showPicker ? 1 : 0.7} />
        <text x={10} y={14.5} fontSize={16} textAnchor="middle" fill="white" fontWeight={300}>+</text>
      </g>

      {/* Type picker popover */}
      {showPicker && (
        <g transform={`translate(${NODE_W + 6}, ${NODE_H / 2 - PICKER_H / 2})`}
          onClick={(e) => e.stopPropagation()}>
          <rect
            x={0} y={0} width={130} height={PICKER_H} rx={8}
            fill={isDark ? '#1e1e1e' : '#ffffff'}
            stroke="rgba(0,0,0,0.15)" strokeWidth={1}
            style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
          />
          {TYPE_PICKER_TYPES.map((t, i) => {
            const tc = NODE_TYPES[t];
            return (
              <g key={t} transform={`translate(0, ${i * 34 + 4})`}
                onClick={(e) => { e.stopPropagation(); onAddChild(node.id, t); setShowPicker(false); }}
                style={{ cursor: 'pointer' }}>
                <rect x={4} y={2} width={122} height={28} rx={6} fill="transparent"
                  className="hover:fill-current" opacity={0} />
                <rect x={4} y={2} width={122} height={28} rx={6} fill={tc.bg} opacity={0.4} />
                <text x={14} y={21} fontSize={11} fill={tc.text} fontWeight={500}>
                  {tc.icon} {tc.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
});
