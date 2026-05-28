'use client';

import CrudPage, { statusBadge, fmtDate, DataRow } from '@/components/CrudPage';
import { getBusinessAppointments, createBusinessAppointment, deleteBusinessAppointment } from '@/lib/api';

export default function FeesPage() {
  return (
    <CrudPage
      title="Fees"
      emptyIcon="💰"
      emptyMessage="No fee records yet"
      addLabel="Add Fee Record"
      columns={[
        { key: 'client_name', label: 'Student' },
        { key: 'client_phone', label: 'Parent Phone' },
        { key: 'metadata', label: 'Amount', render: (v) => {
          const m = v as Record<string, string> | null;
          return m?.amount ? `₹${Number(m.amount).toLocaleString('en-IN')}` : <span className="text-white/20">—</span>;
        }},
        { key: 'scheduled_at', label: 'Due Date', render: fmtDate },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'client_name', label: 'Student Name', type: 'text', required: true },
        { key: 'client_phone', label: 'Parent Phone', type: 'text', placeholder: '+91 98765 43210' },
        { key: 'metadata_amount', label: 'Amount (₹)', type: 'number', required: true, placeholder: '5000' },
        { key: 'date', label: 'Due Date', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Paid', 'Overdue'] },
      ]}
      queryKey="fees"
      fetchFn={(wid) => getBusinessAppointments(wid, 'fee') as Promise<DataRow[]>}
      createFn={(wid, data) => {
        const { metadata_amount, date, ...rest } = data;
        return createBusinessAppointment(wid, {
          ...rest, type: 'fee',
          scheduled_at: date ? `${date}T00:00:00` : null,
          metadata: { amount: metadata_amount },
          status: rest.status || 'Pending',
        }) as Promise<DataRow>;
      }}
      deleteFn={deleteBusinessAppointment}
    />
  );
}
