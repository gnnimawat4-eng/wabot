'use client';

import CrudPage, { statusBadge, DataRow } from '@/components/CrudPage';
import { getBusinessItems, createBusinessItem, deleteBusinessItem } from '@/lib/api';

export default function StaffPage() {
  return (
    <CrudPage
      title="Staff"
      emptyIcon="👨‍💼"
      emptyMessage="No staff added yet"
      addLabel="Add Staff Member"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Specialization' },
        { key: 'status', label: 'Availability', render: statusBadge },
      ]}
      fields={[
        { key: 'name', label: 'Staff Name', type: 'text', required: true, placeholder: 'Priya Sharma' },
        { key: 'description', label: 'Specialization', type: 'text', placeholder: 'Hair & Color' },
        { key: 'status', label: 'Availability', type: 'select', options: ['Active', 'On Leave', 'Inactive'] },
      ]}
      queryKey="staff"
      fetchFn={(wid) => getBusinessItems(wid, 'staff') as Promise<DataRow[]>}
      createFn={(wid, data) => createBusinessItem(wid, { ...data, category: 'staff' }) as Promise<DataRow>}
      deleteFn={deleteBusinessItem}
    />
  );
}
