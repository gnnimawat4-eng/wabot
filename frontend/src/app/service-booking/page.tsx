'use client';

import CrudPage, { statusBadge, fmtDateTime, DataRow } from '@/components/CrudPage';
import { getBusinessAppointments, createBusinessAppointment, deleteBusinessAppointment } from '@/lib/api';

export default function ServiceBookingPage() {
  return (
    <CrudPage
      title="Service Bookings"
      emptyIcon="🔧"
      emptyMessage="No service bookings yet"
      addLabel="Book Service"
      columns={[
        { key: 'client_name', label: 'Customer' },
        { key: 'client_phone', label: 'Phone' },
        { key: 'notes', label: 'Vehicle & Service' },
        { key: 'scheduled_at', label: 'Date & Time', render: fmtDateTime },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'client_name', label: 'Customer Name', type: 'text', required: true },
        { key: 'client_phone', label: 'Phone', type: 'text', placeholder: '+91 98765 43210' },
        { key: 'notes', label: 'Vehicle & Service Type', type: 'text', placeholder: 'Swift - Oil Change + Filter' },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'time', label: 'Time', type: 'time' },
        { key: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'In Progress', 'Done', 'Cancelled'] },
      ]}
      queryKey="service-bookings"
      fetchFn={(wid) => getBusinessAppointments(wid, 'service_booking') as Promise<DataRow[]>}
      createFn={(wid, data) => {
        const { date, time, ...rest } = data;
        return createBusinessAppointment(wid, {
          ...rest, type: 'service_booking',
          scheduled_at: date ? `${date}T${time || '09:00'}:00` : null,
        }) as Promise<DataRow>;
      }}
      deleteFn={deleteBusinessAppointment}
    />
  );
}
