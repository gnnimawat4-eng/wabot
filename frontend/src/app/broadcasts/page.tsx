'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Megaphone, CheckCircle, Clock, XCircle } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useWorkspaceStore } from '@/lib/store';
import { getBroadcasts, createBroadcast } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

type Broadcast = {
  id: string; name: string; template_name: string; status: string;
  sent_count: number; failed_count: number; created_at: string;
};

const statusIcon = (s: string) => {
  if (s === 'completed') return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (s === 'sending') return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
  if (s === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-gray-400" />;
};

function NewBroadcastDialog({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', template_name: '', template_language: 'en' });

  const create = useMutation({
    mutationFn: () => createBroadcast(workspaceId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcasts', workspaceId] });
      toast.success('Broadcast queued!');
      onClose();
    },
    onError: () => toast.error('Failed to create broadcast'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Broadcast</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="WhatsApp template name" value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} />
          <Input placeholder="Language code (e.g. en, hi)" value={form.template_language} onChange={(e) => setForm({ ...form, template_language: e.target.value })} />
          <p className="text-xs text-gray-400">Audience: all opted-in contacts in this workspace.</p>
          <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => create.mutate()} disabled={create.isPending || !form.name || !form.template_name}>
            {create.isPending ? 'Queuing…' : 'Send Broadcast'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BroadcastsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: broadcasts = [], isLoading } = useQuery<Broadcast[]>({
    queryKey: ['broadcasts', activeWorkspace?.id],
    queryFn: () => getBroadcasts(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval: 10000,
  });

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Broadcasts</h1>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />New Broadcast
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : broadcasts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Megaphone className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>No broadcasts yet. Send your first campaign.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {broadcasts.map((b) => {
              const total = b.sent_count + b.failed_count;
              const pct = total > 0 ? Math.round((b.sent_count / total) * 100) : 0;
              return (
                <Card key={b.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {statusIcon(b.status)}
                        <span className="font-medium text-sm">{b.name}</span>
                        <Badge variant="outline" className="text-xs">{b.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-400">Template: {b.template_name} · {timeAgo(b.created_at)}</p>
                      {(b.status === 'sending' || b.status === 'completed') && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{b.sent_count} sent</span>
                            <span>{b.failed_count} failed</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {activeWorkspace && (
        <NewBroadcastDialog open={dialogOpen} onClose={() => setDialogOpen(false)} workspaceId={activeWorkspace.id} />
      )}
    </AppShell>
  );
}
