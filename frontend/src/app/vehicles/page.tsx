'use client';

import CrudPage, { statusBadge, fmtPrice, DataRow } from '@/components/CrudPage';
import { getBusinessItems, createBusinessItem, deleteBusinessItem } from '@/lib/api';

export default function VehiclesPage() {
  return (
    <CrudPage
      title="Vehicles"
      emptyIcon="🚗"
      emptyMessage="No vehicles listed yet"
      addLabel="Add Vehicle"
      columns={[
        { key: 'name', label: 'Make & Model' },
        { key: 'description', label: 'Year' },
        { key: 'price', label: 'Price', render: fmtPrice },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'name', label: 'Make & Model', type: 'text', required: true, placeholder: 'Maruti Swift VXI' },
        { key: 'description', label: 'Year', type: 'text', placeholder: '2023' },
        { key: 'price', label: 'Price (₹)', type: 'number', placeholder: '700000' },
        { key: 'status', label: 'Status', type: 'select', options: ['Available', 'Sold', 'Reserved'] },
      ]}
      queryKey="vehicles"
      fetchFn={(wid) => getBusinessItems(wid, 'vehicle') as Promise<DataRow[]>}
      createFn={(wid, data) => createBusinessItem(wid, { ...data, category: 'vehicle' }) as Promise<DataRow>}
      deleteFn={deleteBusinessItem}
    />
  );
}
