'use client';

import CrudPage, { statusBadge, fmtPrice, DataRow } from '@/components/CrudPage';
import { getBusinessItems, createBusinessItem, deleteBusinessItem } from '@/lib/api';

export default function MenuPage() {
  return (
    <CrudPage
      title="Menu Manager"
      emptyIcon="🍽️"
      emptyMessage="No menu items yet — add your first dish"
      addLabel="Add Item"
      columns={[
        { key: 'name', label: 'Item Name' },
        { key: 'description', label: 'Category' },
        { key: 'price', label: 'Price', render: fmtPrice },
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'name', label: 'Item Name', type: 'text', required: true, placeholder: 'Butter Naan' },
        { key: 'description', label: 'Category', type: 'select', options: ['Starters', 'Main Course', 'Desserts', 'Drinks', 'Sides'] },
        { key: 'price', label: 'Price (₹)', type: 'number', required: true, placeholder: '150' },
        { key: 'status', label: 'Status', type: 'select', options: ['Available', 'Unavailable'] },
      ]}
      queryKey="menu"
      fetchFn={(wid) => getBusinessItems(wid, 'menu') as Promise<DataRow[]>}
      createFn={(wid, data) => createBusinessItem(wid, { ...data, category: 'menu' }) as Promise<DataRow>}
      deleteFn={deleteBusinessItem}
    />
  );
}
