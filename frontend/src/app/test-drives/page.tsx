'use client';

import CrudPage, { statusBadge, fmtDateTime, DataRow } from '@/components/CrudPage';
import { getBusinessAppointments, createBusinessAppointment, deleteBusinessAppointment } from '@/lib/api';

export default function TestDrivesPage() {
  return (
    <CrudPage
      title="Test Drives"
      emptyIcon="🏎️"
      emptyMessage="No test drives scheduled"
      addLabel="Schedule Test Drive"
      columns={[
        { key: 'client_name', label: 'Customer' },
        { key: 'client_phone', label: 'Phone' },
        { key: 'notes', label: 'Vehicle' },
        { key: 'scheduled_at', label: 'Date & Time', render: fmtDateTime },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'client_name', label: 'Customer Name', type: 'text', required: true },
        { key: 'client_phone', label: 'Phone', type: 'text', placeholder: '+91 98765 43210' },
        { key: 'notes', label: 'Vehicle', type: 'text', placeholder: 'Maruti Swift VXI' },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'time', label: 'Time', type: 'time' },
        { key: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'Done', 'Cancelled'] },
      ]}
      queryKey="test-drives"
      fetchFn={(wid) => getBusinessAppointments(wid, 'test_drive') as Promise<DataRow[]>}
      createFn={(wid, data) => {
        const { date, time, ...rest } = data;
        return createBusinessAppointment(wid, {
          ...rest, type: 'test_drive',
          scheduled_at: date ? `${date}T${time || '10:00'}:00` : null,
        }) as Promise<DataRow>;
      }}
      deleteFn={deleteBusinessAppointment}
    />
  );
}
