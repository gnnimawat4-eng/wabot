'use client';

import CrudPage, { statusBadge, DataRow } from '@/components/CrudPage';
import { getBusinessLeads, createBusinessLead, deleteBusinessLead } from '@/lib/api';

export default function LeadsPage() {
  return (
    <CrudPage
      title="Leads"
      emptyIcon="🎯"
      emptyMessage="No leads yet — add your first lead"
      addLabel="Add Lead"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'interest', label: 'Interest' },
        { key: 'status', label: 'Status', render: statusBadge },
        { key: 'notes', label: 'Notes' },
      ]}
      fields={[
        { key: 'name', label: 'Lead Name', type: 'text', required: true },
        { key: 'phone', label: 'Phone', type: 'text', placeholder: '+91 98765 43210' },
        { key: 'interest', label: 'Interest', type: 'text', placeholder: '3BHK in Andheri' },
        { key: 'status', label: 'Status', type: 'select', options: ['New', 'Hot', 'Cold', 'Converted'] },
        { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional details…' },
      ]}
      queryKey="leads"
      fetchFn={(wid) => getBusinessLeads(wid) as Promise<DataRow[]>}
      createFn={(wid, data) => createBusinessLead(wid, data) as Promise<DataRow>}
      deleteFn={deleteBusinessLead}
    />
  );
}
