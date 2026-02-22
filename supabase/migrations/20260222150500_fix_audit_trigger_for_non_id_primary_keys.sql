create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_id text;
begin
  if tg_op = 'INSERT' then
    entity_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'user_id', '');
    perform public.log_audit_event('insert', tg_table_name, entity_id, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    entity_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'user_id', '');
    perform public.log_audit_event('update', tg_table_name, entity_id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    entity_id := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'user_id', '');
    perform public.log_audit_event('delete', tg_table_name, entity_id, to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;
