'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { getContacts, getMessages } from '@/lib/api';
import { cn, initials, timeAgo } from '@/lib/utils';
import api from '@/lib/api';
import { toast } from 'sonner';

type Contact = { id: string; name: string; phone: string; last_message_at?: string };
type Message = { id: string; body: string; direction: 'inbound' | 'outbound'; created_at: string; status: string };

export default function InboxPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-inbox', activeWorkspace?.id],
    queryFn: () => getContacts(activeWorkspace!.id, { limit: 100 }),
    enabled: !!activeWorkspace,
    refetchInterval: 10000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', activeWorkspace?.id, selectedContact?.id],
    queryFn: () => getMessages(activeWorkspace!.id, selectedContact!.id),
    enabled: !!activeWorkspace && !!selectedContact,
    refetchInterval: 5000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useMutation({
    mutationFn: () => api.post(`/workspaces/${activeWorkspace!.id}/contacts/${selectedContact!.id}/send`, { body: text }),
    onSuccess: () => setText(''),
    onError: () => toast.error('Failed to send'),
  });

  const contacts: Contact[] = contactsData?.data ?? [];

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Contact list */}
        <div className="w-72 border-r bg-white flex flex-col">
          <div className="p-3 border-b">
            <p className="font-semibold text-sm">Inbox</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedContact(c)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b text-left',
                  selectedContact?.id === c.id && 'bg-green-50'
                )}
              >
                <div className="h-9 w-9 rounded-full bg-green-100 text-green-700 text-sm font-semibold flex items-center justify-center shrink-0">
                  {initials(c.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name || c.phone}</p>
                  <p className="text-xs text-gray-400 truncate">{c.phone}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {selectedContact ? (
            <>
              <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-green-100 text-green-700 text-xs font-semibold flex items-center justify-center">
                  {initials(selectedContact.name)}
                </div>
                <div>
                  <p className="font-medium text-sm">{selectedContact.name || selectedContact.phone}</p>
                  <p className="text-xs text-gray-400">{selectedContact.phone}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm',
                      msg.direction === 'outbound'
                        ? 'bg-green-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 border rounded-bl-sm'
                    )}>
                      <p>{msg.body}</p>
                      <p className={cn('text-xs mt-0.5', msg.direction === 'outbound' ? 'text-green-200' : 'text-gray-400')}>
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="bg-white border-t p-3 flex gap-2">
                <Input
                  placeholder="Type a message…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && text && send.mutate()}
                />
                <Button
                  size="icon"
                  className="bg-green-600 hover:bg-green-700 shrink-0"
                  onClick={() => send.mutate()}
                  disabled={!text || send.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p>Select a contact to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
