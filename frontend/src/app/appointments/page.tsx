'use client';

import CrudPage, { statusBadge, fmtDateTime, DataRow } from '@/components/CrudPage';
import { useWorkspaceStore } from '@/lib/store';
import { getBusinessAppointments, createBusinessAppointment, deleteBusinessAppointment } from '@/lib/api';

function mkAppt(wid: string, data: Record<string, string>) {
  const { date, time, ...rest } = data;
  return createBusinessAppointment(wid, {
    ...rest,
    type: 'appointment',
    scheduled_at: date ? `${date}T${time || '09:00'}:00` : null,
    status: rest.status || 'Scheduled',
  });
}

export default function AppointmentsPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const isClinic = activeWorkspace?.business_type === 'clinic';

  const clinicColumns = [
    { key: 'client_name', label: 'Patient Name' },
    { key: 'client_phone', label: 'Phone' },
    { key: 'scheduled_at', label: 'Date & Time', render: fmtDateTime },
    { key: 'notes', label: 'Doctor' },
    { key: 'status', label: 'Status', render: statusBadge },
  ];

  const salonColumns = [
    { key: 'client_name', label: 'Client' },
    { key: 'client_phone', label: 'Phone' },
    { key: 'scheduled_at', label: 'Date & Time', render: fmtDateTime },
    { key: 'notes', label: 'Service / Staff' },
    { key: 'status', label: 'Status', render: statusBadge },
  ];

  const clinicFields = [
    { key: 'client_name', label: 'Patient Name', type: 'text' as const, required: true },
    { key: 'client_phone', label: 'Phone', type: 'text' as const, placeholder: '+91 98765 43210' },
    { key: 'date', label: 'Date', type: 'date' as const, required: true },
    { key: 'time', label: 'Time', type: 'time' as const },
    { key: 'notes', label: 'Doctor', type: 'text' as const, placeholder: 'Dr. Sharma' },
    { key: 'status', label: 'Status', type: 'select' as const, options: ['Scheduled', 'Done', 'Cancelled'] },
  ];

  const salonFields = [
    { key: 'client_name', label: 'Client Name', type: 'text' as const, required: true },
    { key: 'client_phone', label: 'Phone', type: 'text' as const, placeholder: '+91 98765 43210' },
    { key: 'date', label: 'Date', type: 'date' as const, required: true },
    { key: 'time', label: 'Time', type: 'time' as const },
    { key: 'notes', label: 'Service & Staff', type: 'text' as const, placeholder: 'Haircut - Priya' },
    { key: 'status', label: 'Status', type: 'select' as const, options: ['Scheduled', 'Done', 'Cancelled'] },
  ];

  return (
    <CrudPage
      title={isClinic ? 'Patient Appointments' : 'Appointments'}
      emptyIcon="📅"
      emptyMessage="No appointments yet — add your first one"
      addLabel="Add Appointment"
      columns={isClinic ? clinicColumns : salonColumns}
      fields={isClinic ? clinicFields : salonFields}
      queryKey="appointments"
      fetchFn={(wid) => getBusinessAppointments(wid, 'appointment') as Promise<DataRow[]>}
      createFn={mkAppt}
      deleteFn={deleteBusinessAppointment}
      refetchInterval={30_000}
    />
  );
}
