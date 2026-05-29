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

// Real estate contact stages
const REAL_ESTATE_STAGE_OPTIONS = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'site_visit_scheduled', label: 'Site Visit Scheduled' },
  { value: 'interested', label: 'Interested' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not Interested' },
];

function getStageFilters(businessType?: string | null) {
  if (businessType === 'real_estate') {
    return [{ value: '', label: 'All' }, ...REAL_ESTATE_STAGE_OPTIONS];
  }
  return [
    { value: '', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'new', label: 'New' },
  ];
}

type Contact = {
  id: string; name: string; phone: string; stage: string;
  tags: string[]; notes?: string; created_at: string; last_message_at?: string;
};

function ContactDialog({
  open, onClose, contact, workspaceId, businessType,
}: { open: boolean; onClose: () => void; contact?: Contact | null; workspaceId: string; businessType?: string | null }) {
  const qc = useQueryClient();
  const isEdit = !!contact;
  const isRealEstate = businessType === 'real_estate';
  const [form, setForm] = useState<{ name: string; phone: string; stage: string; notes: string }>({
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    stage: contact?.stage ?? (isRealEstate ? 'new_lead' : 'new'),
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
      <DialogContent className="bg-[#252525] border-white/10 text-white">
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
          {isRealEstate && (
            <Select value={form.stage} onValueChange={(v) => v && setForm({ ...form, stage: v })}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#252525] border-white/10 text-white">
                {REAL_ESTATE_STAGE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="hover:bg-white/5 focus:bg-white/5">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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

  const isRealEstate = activeWorkspace?.business_type === 'real_estate';
  const stageFilters = getStageFilters(activeWorkspace?.business_type);

  // 'active' and 'new' are client-side date filters, not DB stage values
  const isSpecialFilter = stageFilter === 'active' || stageFilter === 'new';
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', activeWorkspace?.id, stageFilter, search],
    queryFn: () => getContacts(activeWorkspace!.id, {
      stage: (!isSpecialFilter && stageFilter) ? stageFilter : undefined,
      search: search || undefined,
    }),
    enabled: !!activeWorkspace,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteContact(activeWorkspace!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', activeWorkspace?.id] });
      toast.success('Deleted');
    },
  });

  const rawContacts: Contact[] = data?.data ?? [];
  const contacts: Contact[] = rawContacts.filter((c) => {
    if (stageFilter === 'active') return !!c.last_message_at && new Date(c.last_message_at).getTime() > sevenDaysAgo;
    if (stageFilter === 'new') return new Date(c.created_at).getTime() > sevenDaysAgo;
    return true;
  });

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
          {stageFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStageFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                stageFilter === f.value
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-white/10 text-white/50 hover:border-green-500/50 hover:text-white/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Card className="bg-white/5 border-white/8">
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                <TableHead className="text-white/40">Name</TableHead>
                <TableHead className="text-white/40">Phone</TableHead>
                {isRealEstate && <TableHead className="text-white/40">Stage</TableHead>}
                <TableHead className="text-white/40">Last message</TableHead>
                <TableHead className="text-white/40">Added</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={isRealEstate ? 6 : 5} className="text-center py-8 text-white/30">Loading…</TableCell></TableRow>
              ) : contacts.length === 0 ? (
                <TableRow><TableCell colSpan={isRealEstate ? 6 : 5} className="text-center py-8 text-white/30">No contacts yet</TableCell></TableRow>
              ) : contacts.map((c) => (
                <TableRow key={c.id} className="border-white/5 hover:bg-white/3">
                  <TableCell className="font-medium text-white">{c.name || '—'}</TableCell>
                  <TableCell className="text-sm text-white/50">{c.phone}</TableCell>
                  {isRealEstate && (
                    <TableCell>
                      <Badge className={stageColor(c.stage)}>{c.stage.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                  )}
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

      <ContactDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        contact={editing}
        workspaceId={activeWorkspace?.id ?? ''}
        businessType={activeWorkspace?.business_type}
      />
    </AppShell>
  );
}
