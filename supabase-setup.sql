-- Chapter & Charm: run once in Supabase → SQL Editor → New query → Run.
create table if not exists public.chapter_charm_rooms (
  room_id text primary key check (room_id ~ '^[A-Z0-9]{6}$'),
  host_token_hash text not null,
  called_numbers integer[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.chapter_charm_claims (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.chapter_charm_rooms(room_id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 22),
  award text not null check (award in ('Early Five','Top Line','Middle Line','Bottom Line','Full House')),
  created_at timestamptz not null default now(),
  unique (room_id, award)
);
alter table public.chapter_charm_rooms enable row level security;
alter table public.chapter_charm_claims enable row level security;
drop policy if exists "read rooms" on public.chapter_charm_rooms;
drop policy if exists "read claims" on public.chapter_charm_claims;
drop policy if exists "claim prizes" on public.chapter_charm_claims;
create policy "read rooms" on public.chapter_charm_rooms for select to anon, authenticated using (true);
create policy "read claims" on public.chapter_charm_claims for select to anon, authenticated using (true);
create policy "claim prizes" on public.chapter_charm_claims for insert to anon, authenticated with check (true);
grant select on public.chapter_charm_rooms, public.chapter_charm_claims to anon, authenticated;
grant insert on public.chapter_charm_claims to anon, authenticated;
create or replace function public.cc_create_room(p_room text, p_token text) returns void language plpgsql security definer set search_path = public as $$
begin insert into chapter_charm_rooms(room_id, host_token_hash) values (upper(p_room), encode(extensions.digest(p_token, 'sha256'), 'hex')); end; $$;
create or replace function public.cc_draw_number(p_room text, p_token text, p_number integer) returns integer[] language plpgsql security definer set search_path = public as $$
declare nums integer[];
begin
  if p_number not between 1 and 90 then raise exception 'Invalid number'; end if;
  update chapter_charm_rooms set called_numbers = array_prepend(p_number, called_numbers)
  where room_id = upper(p_room) and host_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and not (p_number = any(called_numbers)) returning called_numbers into nums;
  if nums is null then raise exception 'Host permission required'; end if;
  return nums;
end; $$;
grant execute on function public.cc_create_room(text, text), public.cc_draw_number(text, text, integer) to anon, authenticated;
do $$ begin alter publication supabase_realtime add table public.chapter_charm_rooms; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chapter_charm_claims; exception when duplicate_object then null; end $$;
