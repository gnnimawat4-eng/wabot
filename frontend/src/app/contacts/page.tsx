'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Search, Pencil, Trash2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkspaceStore } from '@/lib/store';
import { getContacts, createContact, updateContact, deleteContact } from '@/lib/api';
import { stageColor, timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'];

type Contact = {
  id: string; name: string; phone: string; stage: string;
  tags: string[]; notes?: string; created_at: string; last_message_at?: string;
};

function ContactDialog({
  open, onClose, contact, workspaceId,
}: { open: boolean; onClose: () => void; contact?: Contact | null; workspaceId: string }) {
  const qc = useQueryClient();
  const isEdit = !!contact;
  const [form, setForm] = useState<{ name: string; phone: string; stage: string; notes: string }>({
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    stage: contact?.stage ?? 'new',
    notes: contact?.notes ?? '',
  });

  const save = useMutation({
    mutationFn: () => isEdit
      ? updateContact(workspaceId, contact!.id, form)
      : createContact(workspaceId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      toast.success(isEdit ? 'Contact updated' : 'Contact added');
      onClose();
    },
    onError: () => toast.error('Something went wrong'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0d1424] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{isEdit ? 'Edit Contact' : 'New Contact'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            placeholder="Phone with country code (e.g. +919999999999)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Select value={form.stage} onValueChange={(v) => v && setForm({ ...form, stage: v })}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1424] border-white/10 text-white">
              {STAGES.map((s) => (
                <SelectItem key={s} value={s} className="hover:bg-white/5 focus:bg-white/5">
                  {s.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.phone.trim()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ContactsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', activeWorkspace?.id, stageFilter, search],
    queryFn: () => getContacts(activeWorkspace!.id, { stage: stageFilter || undefined, search: search || undefined }),
    enabled: !!activeWorkspace,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteContact(activeWorkspace!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', activeWorkspace?.id] });
      toast.success('Deleted');
    },
  });

  const contacts: Contact[] = data?.data ?? [];

  const openNew = () => {
    if (!activeWorkspace) {
      toast.error('Create a workspace first — go to Settings');
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    if (!activeWorkspace) return;
    setEditing(c);
    setDialogOpen(true);
  };

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Contacts</h1>
            <p className="text-sm text-white/40 mt-0.5">{data?.count ?? 0} total</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/10 text-white/60 hover:bg-white/5">
              <Upload className="h-4 w-4 mr-1" />Import CSV
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />New Contact
            </Button>
          </div>
        </div>

        {!activeWorkspace && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            No workspace selected.{' '}
            <Link href="/settings" className="underline hover:text-amber-300">
              Go to Settings to create one.
            </Link>
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/30" />
            <Input
              className="pl-8 w-52 bg-white/5 border-white/10 text-white placeholder:text-white/30"
              placeholder="Search name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {['', ...STAGES].map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                stageFilter === s
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-white/10 text-white/50 hover:border-green-500/50 hover:text-white/80'
              }`}
            >
              {s ? s.replace('_', ' ') : 'All'}
            </button>
          ))}
        </div>

        <Card className="bg-white/5 border-white/8">
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                <TableHead className="text-white/40">Name</TableHead>
                <TableHead className="text-white/40">Phone</TableHead>
                <TableHead className="text-white/40">Stage</TableHead>
                <TableHead className="text-white/40">Last message</TableHead>
                <TableHead className="text-white/40">Added</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-white/30">Loading…</TableCell></TableRow>
              ) : contacts.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-white/30">No contacts yet</TableCell></TableRow>
              ) : contacts.map((c) => (
                <TableRow key={c.id} className="border-white/5 hover:bg-white/3">
                  <TableCell className="font-medium text-white">{c.name || '—'}</TableCell>
                  <TableCell className="text-sm text-white/50">{c.phone}</TableCell>
                  <TableCell>
                    <Badge className={stageColor(c.stage)}>{c.stage.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-white/50">
                    {c.last_message_at ? timeAgo(c.last_message_at) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-white/50">{timeAgo(c.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(c)} className="p-1 hover:bg-white/10 rounded">
                        <Pencil className="h-4 w-4 text-white/30" />
                      </button>
                      <button onClick={() => remove.mutate(c.id)} className="p-1 hover:bg-red-500/10 rounded">
                        <Trash2 className="h-4 w-4 text-red-400/60" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Always rendered so dialog opens even before workspace confirmed */}
      <ContactDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        contact={editing}
        workspaceId={activeWorkspace?.id ?? ''}
      />
    </AppShell>
  );
}
