-- ============================================================================
-- [지역 온기 영역] cjsj 프로젝트를 함께 쓰되, 이 사이트의 것은 모두 ongi_ 로 시작합니다.
--   테이블: ongi_admins · ongi_accounts · ongi_plans · ongi_requests · ongi_events · ongi_votes
--   함수:   ongi_is_admin() · ongi_cancel_request() · ongi_touch() · ongi_vote_plan() · ongi_cast_vote() · ongi_vote_tally()
-- CJSJ의 테이블(profiles, survey_responses, events, feedback 등)과 함수(is_admin)는 쓰지도 고치지도 않습니다.
-- SQL Editor에 통째로 붙여 넣고 Run 한 번. 여러 번 실행해도 안전합니다.
-- 원칙: 연락처는 ongi_requests 에만 있고, 본인과 관리자만 읽습니다. 추천 응답·행동 기록에는 개인정보를 넣지 않습니다.
-- ============================================================================

-- 0) 관리자 ------------------------------------------------------------------
-- 관리자는 이메일이 아니라 계정 ID로 등록합니다(같은 이메일로 누가 먼저 가입해도 관리자가 되지 않게).
create table if not exists public.ongi_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.ongi_admins enable row level security; -- 정책 없음: 화면에서는 읽기·쓰기 불가

create or replace function public.ongi_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ongi_admins where user_id = auth.uid())
$$;
grant execute on function public.ongi_is_admin() to anon, authenticated;

-- 대표 계정을 관리자로 등록 (먼저 사이트에서 이 이메일로 가입한 뒤 이 SQL을 실행하세요)
insert into public.ongi_admins (user_id)
select id from auth.users where lower(email) = 'jeaneeyi2004@gmail.com'
on conflict do nothing;

-- 1) 기업 담당자 계정 정보 ----------------------------------------------------
create table if not exists public.ongi_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  company text not null check (char_length(company) between 1 and 100),
  name text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now()
);
alter table public.ongi_accounts enable row level security;
drop policy if exists "ongi_accounts: own" on public.ongi_accounts;
create policy "ongi_accounts: own" on public.ongi_accounts for all to authenticated
  using (id = auth.uid() or public.ongi_is_admin()) with check (id = auth.uid());

-- 2) 맞춤 추천 결과 (응답은 구간·선택지라 개인정보 없음) --------------------------
create table if not exists public.ongi_plans (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id) on delete set null,
  session_id uuid,
  input jsonb not null,
  top jsonb not null,
  code text,
  created_at timestamptz not null default now(),
  constraint ongi_plans_size check (pg_column_size(input) + pg_column_size(top) < 30000)
);
create index if not exists ongi_plans_created_idx on public.ongi_plans (created_at);
alter table public.ongi_plans enable row level security;
drop policy if exists "ongi_plans: insert" on public.ongi_plans;
create policy "ongi_plans: insert" on public.ongi_plans for insert to anon, authenticated
  with check (owner is null or owner = auth.uid());
drop policy if exists "ongi_plans: read" on public.ongi_plans;
create policy "ongi_plans: read" on public.ongi_plans for select to authenticated
  using (owner = auth.uid() or public.ongi_is_admin());
drop policy if exists "ongi_plans: delete own" on public.ongi_plans;
create policy "ongi_plans: delete own" on public.ongi_plans for delete to authenticated using (owner = auth.uid());

-- 3) 의뢰 (연락처 포함) -------------------------------------------------------
create table if not exists public.ongi_requests (
  id text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'contact', 'plan', 'done', 'cancel')),
  program text not null,
  estimate integer,
  contact jsonb not null,
  when_text text,
  memo text check (char_length(memo) <= 2000),
  plan jsonb,
  code text,
  ref text,
  admin_note text,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ongi_requests_created_idx on public.ongi_requests (created_at);
alter table public.ongi_requests enable row level security;
drop policy if exists "ongi_requests: insert own" on public.ongi_requests;
create policy "ongi_requests: insert own" on public.ongi_requests for insert to authenticated
  with check (owner = auth.uid() and status = 'new' and admin_note is null);
drop policy if exists "ongi_requests: read" on public.ongi_requests;
create policy "ongi_requests: read" on public.ongi_requests for select to authenticated
  using (owner = auth.uid() or public.ongi_is_admin());
drop policy if exists "ongi_requests: admin update" on public.ongi_requests;
create policy "ongi_requests: admin update" on public.ongi_requests for update to authenticated
  using (public.ongi_is_admin()) with check (public.ongi_is_admin());
drop policy if exists "ongi_requests: delete own" on public.ongi_requests;
create policy "ongi_requests: delete own" on public.ongi_requests for delete to authenticated using (owner = auth.uid());

-- 본인은 '접수' 상태의 의뢰만 철회할 수 있고, 철회하면 연락처를 지웁니다.
create or replace function public.ongi_cancel_request(rid text) returns void
language sql security definer set search_path = public as $$
  update public.ongi_requests
     set status = 'cancel', updated_at = now(),
         contact = contact || '{"phone":"(파기)","email":"(파기)","bizNo":""}'::jsonb
   where id = rid and owner = auth.uid() and status = 'new';
$$;
grant execute on function public.ongi_cancel_request(text) to authenticated;

create or replace function public.ongi_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists ongi_requests_touch on public.ongi_requests;
create trigger ongi_requests_touch before update on public.ongi_requests for each row execute function public.ongi_touch();

-- 4) 행동 기록 (대시보드용, 가명 세션만) ----------------------------------------
create table if not exists public.ongi_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  type text not null,
  name text check (char_length(name) <= 60),
  value numeric,
  created_at timestamptz not null default now()
);
create index if not exists ongi_events_created_idx on public.ongi_events (created_at);
alter table public.ongi_events enable row level security;
drop policy if exists "ongi_events: insert" on public.ongi_events;
create policy "ongi_events: insert" on public.ongi_events for insert to anon, authenticated with check (true);
drop policy if exists "ongi_events: admin read" on public.ongi_events;
create policy "ongi_events: admin read" on public.ongi_events for select to authenticated using (public.ongi_is_admin());

-- 5) 팀 투표 (같은 회사 담당자끼리 추천안에 투표) ---------------------------------
-- 투표 링크(?vote=추천코드)를 받은 사람은 로그인 없이 투표합니다. 이름 대신 부서·별명만 받습니다.
-- 테이블은 직접 열지 않고 아래 함수로만 투표·집계합니다(관리자는 읽기 가능).
create table if not exists public.ongi_votes (
  id bigint generated always as identity primary key,
  code text not null,
  program text not null check (char_length(program) <= 30),
  voter text not null check (char_length(voter) between 1 and 20),
  comment text check (char_length(comment) <= 200),
  session_id uuid not null,
  created_at timestamptz not null default now(),
  unique (code, session_id)
);
create index if not exists ongi_votes_code_idx on public.ongi_votes (code);
alter table public.ongi_votes enable row level security;
drop policy if exists "ongi_votes: admin read" on public.ongi_votes;
create policy "ongi_votes: admin read" on public.ongi_votes for select to authenticated using (public.ongi_is_admin());

-- 투표 화면에 보여 줄 추천안 (연락처·소유자 없이 추천 목록과 조건만)
create or replace function public.ongi_vote_plan(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('top', top, 'participants', input -> 'participants', 'budget', input -> 'budget')
    from public.ongi_plans where code = p_code order by created_at desc limit 1
$$;

-- 한 브라우저(세션)당 한 표. 다시 투표하면 바뀝니다. 한마디의 전화번호·이메일은 가립니다.
create or replace function public.ongi_cast_vote(p_code text, p_program text, p_voter text, p_comment text, p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not exists (select 1 from public.ongi_plans where code = p_code and top @> jsonb_build_array(jsonb_build_object('id', p_program))) then
    raise exception 'invalid vote';
  end if;
  c := nullif(left(trim(coalesce(p_comment, '')), 200), '');
  if c is not null then
    c := regexp_replace(c, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[이메일]', 'g');
    c := regexp_replace(c, '0?1[0-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}', '[전화번호]', 'g');
  end if;
  insert into public.ongi_votes (code, program, voter, comment, session_id)
  values (p_code, p_program, left(trim(p_voter), 20), c, p_session)
  on conflict (code, session_id) do update set program = excluded.program, voter = excluded.voter, comment = excluded.comment, created_at = now();
end $$;

create or replace function public.ongi_vote_tally(p_code text) returns table (program text, votes bigint, comments jsonb)
language sql stable security definer set search_path = public as $$
  select v.program, count(*),
         coalesce(jsonb_agg(jsonb_build_object('voter', v.voter, 'comment', v.comment)) filter (where v.comment is not null), '[]'::jsonb)
    from public.ongi_votes v where v.code = p_code group by v.program order by count(*) desc
$$;
grant execute on function public.ongi_vote_plan(text), public.ongi_cast_vote(text, text, text, text, uuid), public.ongi_vote_tally(text) to anon, authenticated;

-- 행동 기록에 '투표' 종류 추가
alter table public.ongi_events drop constraint if exists ongi_events_type_check;
alter table public.ongi_events add constraint ongi_events_type_check
  check (type in ('visit', 'section', 'click', 'step', 'result', 'request', 'code', 'ref', 'vote'));
