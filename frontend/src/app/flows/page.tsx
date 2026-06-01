'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { FlowSidebar } from '@/components/flows/FlowSidebar';
import { FlowBuilder } from '@/components/flows/FlowBuilder';
import { EditPanel } from '@/components/flows/EditPanel';
import { AIGenerator } from '@/components/flows/AIGenerator';
import { useWorkspaceStore } from '@/lib/store';
import { getFlow, updateFlow, updateFlowSteps } from '@/lib/api';
import { toast } from 'sonner';
import { useTheme } from '@/app/providers';
import {
  stepsToNodes, nodesToSteps, emptyFlow, layoutNodes,
  type CanvasNode, type NodeType, type RawFlow,
} from '@/components/flows/types';

export default function FlowsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState('');
  const [nodes, setNodes] = useState<Record<string, CanvasNode>>({});
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const [showAI, setShowAI] = useState(false);

  // Load flow from API when selected in sidebar
  const { isFetching: loadingFlow } = useQuery({
    queryKey: ['flow-detail', activeFlowId, activeWorkspace?.id],
    queryFn: async () => {
      const data = await getFlow(activeWorkspace!.id, activeFlowId!);
      const { nodes: n, rootIds: r } = stepsToNodes(data.flow_steps || []);
      const laid = layoutNodes(r, n);

      // If no steps yet, show a trigger node seeded with the flow's keywords
      if (Object.keys(laid).length === 0) {
        const kw = (
          (data as { trigger?: { keyword?: string } }).trigger?.keyword ||
          ((data as { trigger_config?: { keyword?: string } }).trigger_config?.keyword) ||
          'hi,hello'
        ).trim() || 'hi,hello';
        const ef = emptyFlow(kw);
        setNodes(ef.nodes);
        setRootIds(ef.rootIds);
      } else {
        setNodes(laid);
        setRootIds(r);
      }
      setFlowName(data.name || 'Untitled Flow');
      setSelectedNodeId(null);
      setIsSaved(true);
      return data;
    },
    enabled: !!activeFlowId && !!activeWorkspace,
    staleTime: Infinity,
  });

  // Save
  const saveMut = useMutation({
    mutationFn: async () => {
      if (!activeFlowId || !activeWorkspace) throw new Error('No flow selected');
      const steps = nodesToSteps(rootIds, nodes);
      await updateFlow(activeWorkspace.id, activeFlowId, { name: flowName });
      await updateFlowSteps(activeWorkspace.id, activeFlowId, steps);
    },
    onSuccess: () => { setIsSaved(true); qc.invalidateQueries({ queryKey: ['flows', activeWorkspace?.id] }); toast.success('Flow saved!'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to save'),
  });

  const handleSelectFlow = useCallback((flow: RawFlow) => {
    setActiveFlowId(flow.id);
  }, []);

  const handleFlowCreated = useCallback((flow: RawFlow) => {
    setActiveFlowId(flow.id);
  }, []);

  const handleNodesChange = useCallback((n: Record<string, CanvasNode>, r: string[]) => {
    setNodes(n); setRootIds(r); setIsSaved(false);
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setFlowName(name); setIsSaved(false);
  }, []);

  const handleNodeUpdate = useCallback((id: string, updates: Partial<CanvasNode>) => {
    setNodes((prev) => {
      const node = prev[id];
      if (!node) return prev;
      const updated = { ...prev, [id]: { ...node, ...updates } };
      setIsSaved(false);
      return updated;
    });
  }, []);

  const handleNodeDelete = useCallback((id: string) => {
    setNodes((prev) => {
      const toDelete: string[] = [];
      function collect(nid: string) {
        toDelete.push(nid);
        (prev[nid]?.childIds || []).forEach(collect);
      }
      collect(id);
      const deleteSet = new Set(toDelete);

      const updated = { ...prev };
      for (const nid of toDelete) delete updated[nid];

      // Remove from parent's childIds
      for (const n of Object.values(updated)) {
        if (n.childIds.some((c) => deleteSet.has(c))) {
          updated[n.id] = { ...n, childIds: n.childIds.filter((c) => !deleteSet.has(c)) };
        }
      }

      const newRootIds = rootIds.filter((r) => !deleteSet.has(r));
      const laid = layoutNodes(newRootIds, updated);
      setRootIds(newRootIds);
      setSelectedNodeId(null);
      setIsSaved(false);
      return laid;
    });
  }, [rootIds]);

  const handleAddChild = useCallback((parentId: string, type: NodeType) => {
    // Handled inside FlowBuilder via onNodesChange
  }, []);

  const handleAIImport = useCallback((importedNodes: Record<string, CanvasNode>, importedRoots: string[]) => {
    // Merge imported nodes into existing canvas
    const merged = { ...nodes, ...importedNodes };
    const mergedRoots = [...rootIds, ...importedRoots];
    const laid = layoutNodes(mergedRoots, merged);
    setNodes(laid);
    setRootIds(mergedRoots);
    setIsSaved(false);
    // Select first imported root
    if (importedRoots[0]) setSelectedNodeId(importedRoots[0]);
  }, [nodes, rootIds]);

  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;

  return (
    <AppShell>
      <div className="flex h-full" style={{ overflow: 'hidden' }}>

        {/* Left sidebar */}
        <FlowSidebar
          activeFlowId={activeFlowId}
          onSelectFlow={handleSelectFlow}
          onFlowCreated={handleFlowCreated}
        />

        {/* Canvas area */}
        <div className="flex-1 flex overflow-hidden">
          {activeFlowId ? (
            loadingFlow ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 rounded-full border-2 border-transparent"
                  style={{ borderTopColor: 'var(--wb-accent)' }} />
              </div>
            ) : (
              <FlowBuilder
                flowId={activeFlowId!}
                flowName={flowName}
                nodes={nodes}
                rootIds={rootIds}
                selectedNodeId={selectedNodeId}
                isSaved={isSaved}
                isDark={isDark}
                onSelectNode={setSelectedNodeId}
                onNodesChange={handleNodesChange}
                onSave={() => saveMut.mutate()}
                onOpenAI={() => setShowAI(true)}
                onNameChange={handleNameChange}
              />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-40">
              <div className="text-5xl">⚡</div>
              <p className="text-sm" style={{ color: 'var(--wb-text)' }}>
                Select a flow from the sidebar to start editing
              </p>
              <p className="text-xs" style={{ color: 'var(--wb-text-3)' }}>
                or click "+" to create a new one
              </p>
            </div>
          )}

          {/* Right edit panel — slides in/out, canvas expands when closed */}
          <div style={{
            width: selectedNode ? 300 : 0,
            overflow: 'hidden',
            flexShrink: 0,
            transition: 'width 0.2s ease',
            borderLeft: selectedNode ? `1px solid ${isDark ? 'var(--wb-border)' : '#e5e5e5'}` : 'none',
          }}>
            {selectedNode && (
              <EditPanel
                node={selectedNode}
                isDark={isDark}
                onUpdate={handleNodeUpdate}
                onDelete={handleNodeDelete}
                onAddChild={handleAddChild}
                onClose={() => setSelectedNodeId(null)}
              />
            )}
          </div>
        </div>
      </div>

      {/* AI Generator modal */}
      {showAI && activeWorkspace && (
        <AIGenerator
          workspaceId={activeWorkspace.id}
          onImport={handleAIImport}
          onClose={() => setShowAI(false)}
        />
      )}
    </AppShell>
  );
}
