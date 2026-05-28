'use client';

import CrudPage, { statusBadge, fmtPrice, DataRow } from '@/components/CrudPage';
import { getBusinessItems, createBusinessItem, deleteBusinessItem } from '@/lib/api';

export default function PropertiesPage() {
  return (
    <CrudPage
      title="Properties"
      emptyIcon="🏠"
      emptyMessage="No properties listed yet"
      addLabel="Add Property"
      columns={[
        { key: 'name', label: 'Property Name' },
        { key: 'description', label: 'Type' },
        { key: 'metadata', label: 'Location', render: (v) => {
          const m = v as Record<string, string> | null;
          return m?.location || <span className="text-white/20">—</span>;
        }},
        { key: 'price', label: 'Price', render: (v) => fmtPrice(v ? Number(v) * 100000 : null) },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'name', label: 'Property Name', type: 'text', required: true, placeholder: '3BHK Flat - Andheri West' },
        { key: 'description', label: 'Type', type: 'select', options: ['1BHK', '2BHK', '3BHK', '4BHK', 'Villa', 'Plot', 'Commercial', 'Other'] },
        { key: 'price', label: 'Price (₹ Lakhs)', type: 'number', placeholder: '45' },
        { key: 'status', label: 'Status', type: 'select', options: ['Available', 'Sold', 'Rented'] },
      ]}
      queryKey="properties"
      fetchFn={(wid) => getBusinessItems(wid, 'property') as Promise<DataRow[]>}
      createFn={(wid, data) => createBusinessItem(wid, { ...data, category: 'property' }) as Promise<DataRow>}
      deleteFn={deleteBusinessItem}
    />
  );
}
