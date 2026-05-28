'use client';

import CrudPage, { statusBadge, DataRow } from '@/components/CrudPage';
import { getBusinessItems, createBusinessItem, deleteBusinessItem } from '@/lib/api';

export default function StudentsPage() {
  return (
    <CrudPage
      title="Students"
      emptyIcon="🎓"
      emptyMessage="No students added yet"
      addLabel="Add Student"
      columns={[
        { key: 'name', label: 'Student Name' },
        { key: 'metadata', label: 'Phone', render: (v) => {
          const m = v as Record<string, string> | null;
          return m?.phone || <span className="text-white/20">—</span>;
        }},
        { key: 'description', label: 'Class' },
        { key: 'status', label: 'Fee Status', render: statusBadge },
      ]}
      fields={[
        { key: 'name', label: 'Student Name', type: 'text', required: true },
        { key: 'metadata_phone', label: 'Phone', type: 'text', placeholder: '+91 98765 43210' },
        { key: 'description', label: 'Class', type: 'text', placeholder: '10th Grade A' },
        { key: 'status', label: 'Fee Status', type: 'select', options: ['Paid', 'Pending', 'Overdue'] },
      ]}
      queryKey="students"
      fetchFn={(wid) => getBusinessItems(wid, 'student') as Promise<DataRow[]>}
      createFn={(wid, data) => {
        const { metadata_phone, ...rest } = data;
        return createBusinessItem(wid, {
          ...rest, category: 'student', metadata: { phone: metadata_phone },
        }) as Promise<DataRow>;
      }}
      deleteFn={deleteBusinessItem}
    />
  );
}
