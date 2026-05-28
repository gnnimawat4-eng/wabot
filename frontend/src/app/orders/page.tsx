'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import CrudPage, { statusBadge, fmtDateTime, DataRow } from '@/components/CrudPage';
import { useWorkspaceStore } from '@/lib/store';
import { getBusinessAppointments, createBusinessAppointment, deleteBusinessAppointment, updateBusinessAppointment } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

function MarkDoneBtn({ row, workspaceId, queryKey }: { row: DataRow; workspaceId: string; queryKey: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => updateBusinessAppointment(workspaceId, row.id, { status: 'Done' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey, workspaceId] }); toast.success('Marked as done'); },
    onError: () => toast.error('Failed'),
  });
  if (row.status === 'Done') return null;
  return (
    <Button size="sm" onClick={(e) => { e.stopPropagation(); mut.mutate(); }} disabled={mut.isPending}
      className="h-6 text-xs px-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20">
      <Check className="h-3 w-3 mr-1" />Done
    </Button>
  );
}

export default function OrdersPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const isRetail = activeWorkspace?.business_type === 'retail';

  return (
    <CrudPage
      title={isRetail ? 'Orders' : 'Orders'}
      emptyIcon="📋"
      emptyMessage="No orders yet"
      addLabel="Add Order"
      columns={[
        { key: 'notes', label: 'Items / Description' },
        { key: 'client_name', label: 'Customer' },
        { key: 'created_at', label: 'Time', render: fmtDateTime },
        { key: 'status', label: 'Status', render: statusBadge },
        { key: 'id', label: '', render: (_, row) =>
          activeWorkspace ? <MarkDoneBtn row={row} workspaceId={activeWorkspace.id} queryKey="orders" /> : null
        },
      ]}
      fields={[
        { key: 'notes', label: 'Items / Description', type: 'text', required: true, placeholder: '2x Burger, 1x Fries' },
        { key: 'client_name', label: 'Customer Name', type: 'text', placeholder: 'Walk-in' },
        { key: 'client_phone', label: 'Customer Phone', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Done', 'Cancelled'] },
      ]}
      queryKey="orders"
      fetchFn={(wid) => getBusinessAppointments(wid, 'order') as Promise<DataRow[]>}
      createFn={(wid, data) => createBusinessAppointment(wid, {
        ...data, type: 'order', scheduled_at: new Date().toISOString(), status: data.status || 'Pending',
      }) as Promise<DataRow>}
      deleteFn={deleteBusinessAppointment}
      refetchInterval={15_000}
    />
  );
}
