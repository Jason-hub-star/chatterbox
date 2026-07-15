-- Avatar Forge orphan-job recovery: Modal parent hard stops never leave a user-visible active row forever.
-- Contract: Edge already owns provider_call_id; Modal renews a phase lease through service-role RPC;
-- pg_cron closes only expired queued/running rows. Terminal transitions are conditional and idempotent.

alter table public.avatar_jobs
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz;

create index if not exists avatar_jobs_active_lease_idx
  on public.avatar_jobs (lease_expires_at)
  where status = 'running';

create or replace function public.renew_avatar_job_lease(
  p_job_id uuid,
  p_phase text,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_phase not in ('analyzing', 'cutting', 'rigging', 'finishing') then
    raise exception 'AVATAR_PHASE_INVALID';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 21600 then
    raise exception 'AVATAR_LEASE_INVALID';
  end if;

  update public.avatar_jobs
     set phase = p_phase,
         last_heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where id = p_job_id
     and status = 'running';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.complete_avatar_job(
  p_job_id uuid,
  p_result_project_url text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.avatar_jobs
     set status = 'done',
         phase = 'finishing',
         result_project_url = p_result_project_url,
         error = null,
         last_heartbeat_at = now(),
         lease_expires_at = now(),
         completed_at = now(),
         updated_at = now()
   where id = p_job_id
     and status = 'running';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.fail_avatar_job(
  p_job_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_error_code not in ('pipeline_error', 'orchestrator_timeout', 'provider_error') then
    raise exception 'AVATAR_ERROR_CODE_INVALID';
  end if;

  update public.avatar_jobs
     set status = 'failed',
         error = p_error_code,
         last_heartbeat_at = now(),
         lease_expires_at = now(),
         completed_at = now(),
         updated_at = now()
   where id = p_job_id
     and status in ('queued', 'running');
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.reconcile_stuck_avatar_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id
      from public.avatar_jobs
     where (status = 'queued' and updated_at < now() - interval '15 minutes')
        or (status = 'running'
            and coalesce(lease_expires_at, updated_at + interval '90 minutes') < now())
     for update skip locked
  loop
    if public.fail_avatar_job(r.id, 'orchestrator_timeout') then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- All lifecycle mutations are service-only. The cron owner retains execution as function owner.
revoke all on function public.renew_avatar_job_lease(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_avatar_job(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_avatar_job(uuid, text) from public, anon, authenticated;
revoke all on function public.reconcile_stuck_avatar_jobs() from public, anon, authenticated;
grant execute on function public.renew_avatar_job_lease(uuid, text, integer) to service_role;
grant execute on function public.complete_avatar_job(uuid, text) to service_role;
grant execute on function public.fail_avatar_job(uuid, text) to service_role;
grant execute on function public.reconcile_stuck_avatar_jobs() to service_role;

-- Same graceful-local pattern as VGEN: a missing pg_cron extension does not break db reset.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
      perform cron.schedule(
        'avatar-reconcile-stuck',
        '*/5 * * * *',
        'select public.reconcile_stuck_avatar_jobs();'
      );
    exception when others then
      raise notice 'pg_cron schedule skipped: %', sqlerrm;
    end;
  end if;
end;
$$;
