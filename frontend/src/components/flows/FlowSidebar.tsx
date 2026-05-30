'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Edit3, Check, X, Loader2, Zap } from 'lucide-react';
import { getFlows, createFlow, deleteFlow, updateFlow } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/store';
import { toast } from 'sonner';
import type { RawFlow } from './types';

interface Props {
  activeFlowId: string | null;
  onSelectFlow: (flow: RawFlow) => void;
  onFlowCreated: (flow: RawFlow) => void;
}

interface ContextMenu {
  flowId: string;
  x: number;
  y: number;
}

export function FlowSidebar({ activeFlowId, onSelectFlow, onFlowCreated }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: flows = [], isLoading } = useQuery<RawFlow[]>({
    queryKey: ['flows', activeWorkspace?.id],
    queryFn: () => getFlows(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  });

  const createMut = useMutation({
    mutationFn: () => createFlow(activeWorkspace!.id, {
      name: 'New Flow', trigger: { type: 'keyword', keyword: 'hi,hello' }, steps: [],
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] });
      onFlowCreated(data as RawFlow);
      toast.success('Flow created');
    },
    onError: () => toast.error('Failed to create flow'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFlow(activeWorkspace!.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] }); toast.success('Flow deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateFlow(activeWorkspace!.id, id, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] }); setRenamingId(null); },
    onError: () => toast.error('Failed to rename'),
  });

  const triggerLabel = (flow: RawFlow) => {
    const kw = flow.trigger?.keyword || flow.trigger_config?.keyword as string || '';
    return kw ? kw.split(',').slice(0, 3).map((k) => k.trim()).filter(Boolean) : [];
  };

  const filtered = flows.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  const handleContextMenu = useCallback((e: React.MouseEvent, flowId: string) => {
    e.preventDefault();
    setContextMenu({ flowId, x: e.clientX, y: e.clientY });
  }, []);

  const startRename = (flow: RawFlow) => {
    setRenamingId(flow.id);
    setRenameValue(flow.name);
    setContextMenu(null);
  };

  const confirmRename = (id: string) => {
    if (renameValue.trim()) renameMut.mutate({ id, name: renameValue.trim() });
  };

  const confirmDelete = (id: string) => {
    if (confirm('Delete this flow? This cannot be undone.')) {
      deleteMut.mutate(id);
    }
    setContextMenu(null);
  };

  // Long press on touch devices
  const handleTouchStart = (flowId: string) => {
    longPressTimer.current = setTimeout(() => setContextMenu({ flowId, x: 80, y: 100 }), 600);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ width: 240, minWidth: 240, borderRight: '1px solid var(--wb-border)', background: 'var(--wb-bg-sidebar)' }}
      onClick={() => setContextMenu(null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: '1px solid var(--wb-border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>Flows</h2>
        <button
          onClick={() => { if (activeWorkspace) createMut.mutate(); else toast.error('Create a workspace first'); }}
          disabled={createMut.isPending}
          className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          style={{ color: 'var(--wb-accent)' }}
          title="New flow"
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--wb-border)' }}>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--wb-text-3)' }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flows…"
            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1"
            style={{
              background: 'var(--wb-input)', borderColor: 'var(--wb-input-border)',
              color: 'var(--wb-text)', border: '1px solid var(--wb-input-border)',
              '--tw-ring-color': 'var(--wb-accent-ring)',
            } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Flow list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--wb-text-3)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-20" style={{ color: 'var(--wb-text)' }} />
            <p className="text-xs" style={{ color: 'var(--wb-text-3)' }}>
              {search ? 'No flows match your search.' : "No flows yet. Create your first!"}
            </p>
          </div>
        ) : (
          filtered.map((flow) => {
            const isActive = flow.id === activeFlowId;
            const isRenaming = renamingId === flow.id;
            const keywords = triggerLabel(flow);

            return (
              <div
                key={flow.id}
                className="relative group cursor-pointer"
                onClick={() => !isRenaming && onSelectFlow(flow)}
                onContextMenu={(e) => handleContextMenu(e, flow.id)}
                onTouchStart={() => handleTouchStart(flow.id)}
                onTouchEnd={handleTouchEnd}
                style={{
                  borderLeft: isActive ? '2px solid var(--wb-accent)' : '2px solid transparent',
                  background: isActive ? 'var(--wb-bg-active)' : undefined,
                }}
              >
                <div className="px-3 py-2.5">
                  {isRenaming ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(flow.id); if (e.key === 'Escape') setRenamingId(null); }}
                        className="flex-1 text-xs px-2 py-1 rounded focus:outline-none"
                        style={{ background: 'var(--wb-input)', border: '1px solid var(--wb-accent)', color: 'var(--wb-text)' }}
                      />
                      <button onClick={() => confirmRename(flow.id)} className="p-1 rounded text-green-400 hover:bg-green-500/10">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={() => setRenamingId(null)} className="p-1 rounded text-red-400 hover:bg-red-500/10">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium truncate" style={{ color: isActive ? 'var(--wb-accent)' : 'var(--wb-text)' }}>
                        {flow.name}
                      </p>
                      {keywords.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {keywords.map((kw) => (
                            <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Hover actions */}
                {!isRenaming && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); startRename(flow); }}
                      className="p-1 rounded hover:bg-white/10" style={{ color: 'var(--wb-text-3)' }}>
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); confirmDelete(flow.id); }}
                      className="p-1 rounded hover:bg-red-500/10 text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg shadow-xl py-1 min-w-[130px]"
          style={{ top: contextMenu.y, left: contextMenu.x, background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { const f = flows.find((fl) => fl.id === contextMenu.flowId); if (f) startRename(f); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-white/5" style={{ color: 'var(--wb-text)' }}>
            <Edit3 className="h-3.5 w-3.5" /> Rename
          </button>
          <button onClick={() => confirmDelete(contextMenu.flowId)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
