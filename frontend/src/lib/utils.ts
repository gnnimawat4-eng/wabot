import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

export function stageColor(stage: string) {
  const map: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    new_lead: 'bg-blue-100 text-blue-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    site_visit_scheduled: 'bg-purple-100 text-purple-800',
    qualified: 'bg-purple-100 text-purple-800',
    interested: 'bg-indigo-100 text-indigo-800',
    proposal: 'bg-orange-100 text-orange-800',
    negotiation: 'bg-orange-100 text-orange-800',
    converted: 'bg-green-100 text-green-800',
    closed_won: 'bg-green-100 text-green-800',
    not_interested: 'bg-red-100 text-red-800',
    closed_lost: 'bg-red-100 text-red-800',
  }
  return map[stage] ?? 'bg-gray-100 text-gray-800'
}

export function formatPhone(phone: string) {
  return phone.startsWith('+') ? phone : `+${phone}`
}
