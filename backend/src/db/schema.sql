-- WaBot Database Schema
-- Run this in Supabase SQL Editor

-- Extensions
create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz default now()
);

-- Workspaces
create table if not exists workspaces (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  wa_phone_number_id text,
  wa_phone_number text,
  wa_access_token text,
  wa_business_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workspaces_owner on workspaces(owner_id);
create index if not exists idx_workspaces_phone_id on workspaces(wa_phone_number_id);

-- Contacts
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  phone text not null,
  name text,
  stage text not null default 'new',
  tags text[] default '{}',
  notes text,
  opted_in boolean default true,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, phone)
);
create index if not exists idx_contacts_workspace on contacts(workspace_id);
create index if not exists idx_contacts_stage on contacts(workspace_id, stage);

-- Messages
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  type text not null default 'text',
  body text,
  wa_message_id text,
  status text default 'sent',
  created_at timestamptz default now()
);
create index if not exists idx_messages_workspace on messages(workspace_id);
create index if not exists idx_messages_contact on messages(contact_id);
create index if not exists idx_messages_wa_id on messages(wa_message_id);

-- Quick replies
create table if not exists quick_replies (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  shortcut text not null,
  message text not null,
  created_at timestamptz default now()
);
create index if not exists idx_qr_workspace on quick_replies(workspace_id);

-- Flows
create table if not exists flows (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  trigger jsonb default '{}',
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_flows_workspace on flows(workspace_id);

-- Flow steps
create table if not exists flow_steps (
  id uuid primary key default uuid_generate_v4(),
  flow_id uuid not null references flows(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  position integer not null default 0,
  type text not null,
  config jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_flow_steps_flow on flow_steps(flow_id);

-- Flow runs
create table if not exists flow_runs (
  id uuid primary key default uuid_generate_v4(),
  flow_id uuid not null references flows(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  status text not null default 'running',
  current_step integer default 0,
  started_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists idx_flow_runs_workspace on flow_runs(workspace_id);
create index if not exists idx_flow_runs_contact on flow_runs(contact_id);

-- Broadcasts
create table if not exists broadcasts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  template_name text not null,
  template_language text default 'en',
  template_components jsonb default '[]',
  audience_filter jsonb default '{}',
  status text default 'queued',
  sent_count integer default 0,
  failed_count integer default 0,
  created_at timestamptz default now()
);
create index if not exists idx_broadcasts_workspace on broadcasts(workspace_id);

-- Subscriptions
create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade unique,
  user_id uuid not null references profiles(id) on delete cascade,
  razorpay_subscription_id text,
  plan text not null default 'starter',
  status text default 'created',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_subs_workspace on subscriptions(workspace_id);

-- Trigger to auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
