'use client';

import CrudPage, { statusBadge, fmtDateTime, DataRow } from '@/components/CrudPage';
import { getBusinessAppointments, createBusinessAppointment, deleteBusinessAppointment } from '@/lib/api';

export default function SiteVisitsPage() {
  return (
    <CrudPage
      title="Site Visits"
      emptyIcon="📅"
      emptyMessage="No site visits scheduled"
      addLabel="Schedule Visit"
      columns={[
        { key: 'client_name', label: 'Client Name' },
        { key: 'client_phone', label: 'Phone' },
        { key: 'notes', label: 'Property' },
        { key: 'scheduled_at', label: 'Date & Time', render: fmtDateTime },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'client_name', label: 'Client Name', type: 'text', required: true },
        { key: 'client_phone', label: 'Phone', type: 'text', placeholder: '+91 98765 43210' },
        { key: 'notes', label: 'Property Name', type: 'text', placeholder: '3BHK - Andheri West' },
        { key: 'date', label: 'Visit Date', type: 'date', required: true },
        { key: 'time', label: 'Time', type: 'time' },
        { key: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'Done', 'Cancelled'] },
      ]}
      queryKey="site-visits"
      fetchFn={(wid) => getBusinessAppointments(wid, 'site_visit') as Promise<DataRow[]>}
      createFn={(wid, data) => {
        const { date, time, ...rest } = data;
        return createBusinessAppointment(wid, {
          ...rest, type: 'site_visit',
          scheduled_at: date ? `${date}T${time || '10:00'}:00` : null,
        }) as Promise<DataRow>;
      }}
      deleteFn={deleteBusinessAppointment}
    />
  );
}
