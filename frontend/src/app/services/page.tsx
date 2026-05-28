'use client';

import CrudPage, { statusBadge, fmtPrice, DataRow } from '@/components/CrudPage';
import { useWorkspaceStore } from '@/lib/store';
import { getBusinessItems, createBusinessItem, deleteBusinessItem } from '@/lib/api';

export default function ServicesPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const btype = activeWorkspace?.business_type;
  const isAuto = btype === 'automobile';

  const title = isAuto ? 'Service Types' : 'Services';

  return (
    <CrudPage
      title={title}
      emptyIcon="🛠️"
      emptyMessage="No services added yet"
      addLabel="Add Service"
      columns={[
        { key: 'name', label: 'Service Name' },
        { key: 'description', label: isAuto ? 'Details' : 'Duration / Details' },
        { key: 'price', label: 'Price', render: fmtPrice },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'name', label: 'Service Name', type: 'text', required: true, placeholder: isAuto ? 'Oil Change' : 'Consultation' },
        { key: 'description', label: isAuto ? 'Details' : 'Duration', type: 'text', placeholder: isAuto ? 'Full service included' : '30 min' },
        { key: 'price', label: 'Price (₹)', type: 'number', placeholder: '500' },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
      ]}
      queryKey="services"
      fetchFn={(wid) => getBusinessItems(wid, 'service') as Promise<DataRow[]>}
      createFn={(wid, data) => createBusinessItem(wid, { ...data, category: 'service' }) as Promise<DataRow>}
      deleteFn={deleteBusinessItem}
    />
  );
}
