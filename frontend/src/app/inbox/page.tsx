'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Send, MessageSquare } from 'lucide-react';
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

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['contacts-inbox', activeWorkspace?.id],
    queryFn: () => getContacts(activeWorkspace!.id, { limit: 100 }),
    enabled: !!activeWorkspace,
    refetchInterval: 10_000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['messages', activeWorkspace?.id, selectedContact?.id],
    queryFn: () => getMessages(activeWorkspace!.id, selectedContact!.id),
    enabled: !!activeWorkspace && !!selectedContact,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useMutation({
    mutationFn: () => api.post(`/workspaces/${activeWorkspace!.id}/contacts/${selectedContact!.id}/send`, { body: text }),
    onSuccess: () => setText(''),
    onError: () => toast.error('Failed to send message'),
  });

  const contacts: Contact[] = contactsData?.data ?? [];

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Contact list */}
        <div className="w-72 border-r border-white/5 bg-[#0d1424] flex flex-col">
          <div className="px-4 py-4 border-b border-white/5">
            <p className="text-sm font-semibold text-white">Inbox</p>
            <p className="text-xs text-white/40 mt-0.5">{contacts.length} conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {contactsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border-b border-white/5 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-white/10 rounded w-24" />
                    <div className="h-2.5 bg-white/5 rounded w-16" />
                  </div>
                </div>
              ))
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-white/25 text-xs text-center px-4">
                <MessageSquare className="h-6 w-6 mb-2 text-white/10" />
                No conversations yet
              </div>
            ) : (
              contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedContact(c)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 border-b border-white/5 text-left transition-colors',
                    selectedContact?.id === c.id
                      ? 'bg-green-500/10'
                      : 'hover:bg-white/5'
                  )}
                >
                  <div className="h-9 w-9 rounded-full bg-green-500/20 text-green-400 text-sm font-semibold flex items-center justify-center shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.name || c.phone}</p>
                    <p className="text-xs text-white/40 truncate">{c.phone}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-[#0a0f1e]">
          {selectedContact ? (
            <>
              {/* Chat header */}
              <div className="border-b border-white/5 px-5 py-3 flex items-center gap-3 bg-[#0d1424]">
                <div className="h-8 w-8 rounded-full bg-green-500/20 text-green-400 text-xs font-semibold flex items-center justify-center">
                  {initials(selectedContact.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{selectedContact.name || selectedContact.phone}</p>
                  <p className="text-xs text-white/40">{selectedContact.phone}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full text-white/25 text-sm">Loading…</div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/25 text-sm">No messages yet</div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-xs lg:max-w-md px-3.5 py-2.5 rounded-2xl text-sm',
                        msg.direction === 'outbound'
                          ? 'bg-green-600 text-white rounded-br-sm'
                          : 'bg-white/8 text-white/90 rounded-bl-sm'
                      )}>
                        <p className="leading-relaxed">{msg.body}</p>
                        <p className={cn('text-xs mt-1', msg.direction === 'outbound' ? 'text-green-200/70' : 'text-white/30')}>
                          {timeAgo(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-white/5 p-3 flex gap-2 bg-[#0d1424]">
                <Input
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-green-500/40"
                  placeholder="Type a message…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && text.trim() && send.mutate()}
                />
                <Button
                  size="icon"
                  className="bg-green-600 hover:bg-green-700 shrink-0"
                  onClick={() => send.mutate()}
                  disabled={!text.trim() || send.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-white/20 gap-3">
              <MessageSquare className="h-10 w-10 text-white/10" />
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
