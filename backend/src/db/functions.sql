-- WaBot Postgres Functions
-- Run after schema.sql

-- Workspace stats for dashboard
create or replace function get_workspace_stats(ws_id uuid)
returns json language plpgsql as $$
declare
  result json;
begin
  select json_build_object(
    'total_contacts', (select count(*) from contacts where workspace_id = ws_id),
    'new_contacts_today', (select count(*) from contacts where workspace_id = ws_id and created_at >= current_date),
    'messages_today', (select count(*) from messages where workspace_id = ws_id and created_at >= current_date),
    'active_flows', (select count(*) from flows where workspace_id = ws_id and is_active = true),
    'running_flows', (select count(*) from flow_runs where workspace_id = ws_id and status = 'running'),
    'stage_counts', (
      select json_object_agg(stage, cnt)
      from (select stage, count(*) as cnt from contacts where workspace_id = ws_id group by stage) t
    ),
    'messages_7d', (
      select json_agg(row_to_json(t))
      from (
        select
          date_trunc('day', created_at)::date as day,
          count(*) filter (where direction = 'inbound') as inbound,
          count(*) filter (where direction = 'outbound') as outbound
        from messages
        where workspace_id = ws_id and created_at >= now() - interval '7 days'
        group by 1
        order by 1
      ) t
    )
  ) into result;
  return result;
end;
$$;
