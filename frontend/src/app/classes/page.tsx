'use client';

import CrudPage, { statusBadge, DataRow } from '@/components/CrudPage';
import { getBusinessItems, createBusinessItem, deleteBusinessItem } from '@/lib/api';

export default function ClassesPage() {
  return (
    <CrudPage
      title="Classes"
      emptyIcon="📚"
      emptyMessage="No classes added yet"
      addLabel="Add Class"
      columns={[
        { key: 'name', label: 'Class Name' },
        { key: 'description', label: 'Subject' },
        { key: 'metadata', label: 'Teacher', render: (v) => {
          const m = v as Record<string, string> | null;
          return m?.teacher || <span className="text-white/20">—</span>;
        }},
        { key: 'metadata', label: 'Schedule', render: (v) => {
          const m = v as Record<string, string> | null;
          return m?.schedule || <span className="text-white/20">—</span>;
        }},
        { key: 'status', label: 'Status', render: statusBadge },
      ]}
      fields={[
        { key: 'name', label: 'Class Name', type: 'text', required: true, placeholder: '10th Grade A' },
        { key: 'description', label: 'Subject', type: 'text', placeholder: 'Mathematics' },
        { key: 'metadata_teacher', label: 'Teacher', type: 'text', placeholder: 'Mr. Sharma' },
        { key: 'metadata_schedule', label: 'Schedule', type: 'text', placeholder: 'Mon/Wed/Fri 9-10 AM' },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
      ]}
      queryKey="classes"
      fetchFn={(wid) => getBusinessItems(wid, 'class') as Promise<DataRow[]>}
      createFn={(wid, data) => {
        const { metadata_teacher, metadata_schedule, ...rest } = data;
        return createBusinessItem(wid, {
          ...rest, category: 'class',
          metadata: { teacher: metadata_teacher, schedule: metadata_schedule },
        }) as Promise<DataRow>;
      }}
      deleteFn={deleteBusinessItem}
    />
  );
}
