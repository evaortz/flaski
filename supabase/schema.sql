-- =====================================================================
-- Flaski · esquema de base de datos para Supabase
-- Pega TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar varias veces sin romper nada.
-- =====================================================================

-- ---------- Perfiles (nombre visible de cada usuario) ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at   timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)), 40))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Mazos ----------
create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  is_public   boolean not null default false,
  source      text not null default '',           -- de dónde se copió (opcional)
  created_at  timestamptz not null default now()
);
create index if not exists decks_owner_idx on public.decks (owner);
create index if not exists decks_public_idx on public.decks (is_public) where is_public;

-- ---------- Carpetas (se pueden anidar) ----------
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id  uuid references public.folders on delete set null,
  name       text not null check (char_length(name) between 1 and 80),
  icon       text not null default '' check (char_length(icon) <= 16),
  color      text not null default '' check (char_length(color) <= 16),
  position   double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now()
);
create index if not exists folders_owner_idx on public.folders (owner);

-- ---------- Etiquetas ----------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text not null default 'gray' check (char_length(color) <= 16),
  created_at timestamptz not null default now()
);
create index if not exists tags_owner_idx on public.tags (owner);

-- Organización de los mazos (columnas añadidas en la versión 2)
alter table public.decks add column if not exists folder_id uuid references public.folders on delete set null;
alter table public.decks add column if not exists icon      text not null default '';
alter table public.decks add column if not exists color     text not null default '';
alter table public.decks add column if not exists tags      uuid[] not null default '{}';
alter table public.decks add column if not exists pinned    boolean not null default false;
alter table public.decks add column if not exists archived  boolean not null default false;
alter table public.decks add column if not exists updated_at timestamptz not null default now();

-- ---------- Tarjetas ----------
create table if not exists public.cards (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid not null references public.decks on delete cascade,
  owner      uuid not null default auth.uid() references auth.users on delete cascade,
  front      text not null check (char_length(front) between 1 and 2000),
  back       text not null check (char_length(back) between 1 and 2000),
  note       text not null default '' check (char_length(note) <= 2000),
  position   double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now()
);
create index if not exists cards_deck_idx on public.cards (deck_id);
create index if not exists cards_owner_idx on public.cards (owner);

-- Tipos de tarjeta y campos (columnas añadidas en la versión 3)
alter table public.cards add column if not exists note_id  uuid;
alter table public.cards add column if not exists type_id  text not null default 'basic';
alter table public.cards add column if not exists template text not null default 't1';
alter table public.cards add column if not exists fields   jsonb not null default '{}'::jsonb;
alter table public.cards add column if not exists hint     text not null default '';
alter table public.cards add column if not exists tags     uuid[] not null default '{}';
create index if not exists cards_note_idx on public.cards (note_id);
-- Copia de los tipos personalizados que usa un mazo (para poder compartirlo tal cual)
alter table public.decks add column if not exists types   jsonb not null default '[]'::jsonb;
-- Opciones de estudio por mazo (newPerDay override, preset de algoritmo)
alter table public.decks add column if not exists options jsonb not null default '{}'::jsonb;

-- ---------- Tipos de tarjeta personalizados ----------
create table if not exists public.note_types (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  icon        text not null default '' check (char_length(icon) <= 16),
  description text not null default '' check (char_length(description) <= 300),
  fields      jsonb not null default '[]'::jsonb,
  templates   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists note_types_owner_idx on public.note_types (owner);

-- ---------- Progreso de repaso (uno por usuario y tarjeta) ----------
create table if not exists public.progress (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  card_id    uuid not null references public.cards on delete cascade,
  reps       int  not null default 0,
  interval   int  not null default 0,          -- días
  ease       real not null default 2.5,
  lapses     int  not null default 0,
  due        timestamptz not null,
  first_seen timestamptz not null default now(),
  last       timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- ---------- Repasos por día (para la racha y el calendario) ----------
create table if not exists public.review_log (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

-- ---------- Ajustes ----------
create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  new_per_day int not null default 15 check (new_per_day between 0 and 500)
);
-- Preferencias del usuario (columna añadida con la pantalla de Ajustes)
alter table public.settings add column if not exists prefs jsonb not null default '{}'::jsonb;

-- ---------- Historial de respuestas (para estadísticas) ----------
create table if not exists public.review_events (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  card_id  uuid references public.cards on delete set null,
  deck_id  uuid references public.decks on delete set null,
  ts       timestamptz not null default now(),
  grade    int  not null check (grade between 1 and 4),
  state    text not null default 'new' check (state in ('new','learning','review','relearning')),
  ivl      real not null default 0,
  last_ivl real not null default 0,
  ease     real not null default 2.5,
  ms       int  not null default 0
);
create index if not exists review_events_user_ts_idx on public.review_events (user_id, ts);

-- ---------- Apuntes (versión 5) ----------
-- Cada página es una lista de bloques [{ id, type: 'p'|'h1'|'h2'|'li', text }]. El id de cada bloque
-- no cambia al editar, para que las tarjetas puedan apuntar a «esa parte» de la página.
create table if not exists public.pages (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null default '' check (char_length(title) <= 120),
  icon       text not null default '' check (char_length(icon) <= 16),
  deck_id    uuid references public.decks on delete set null,   -- mazo donde van sus tarjetas
  folder_id  uuid references public.folders on delete set null,
  blocks     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pages_owner_idx on public.pages (owner);
-- Tarjetas vinculadas a un bloque de unos apuntes
alter table public.cards add column if not exists page_id  uuid references public.pages on delete set null;
alter table public.cards add column if not exists block_id text;
create index if not exists cards_page_idx on public.cards (page_id);

-- =====================================================================
-- Seguridad (Row Level Security): cada persona solo ve y cambia lo suyo.
-- Los mazos marcados como públicos (y sus tarjetas) los puede LEER
-- cualquier usuario registrado, pero no modificarlos.
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.decks         enable row level security;
alter table public.cards         enable row level security;
alter table public.progress      enable row level security;
alter table public.review_log    enable row level security;
alter table public.settings      enable row level security;
alter table public.folders       enable row level security;
alter table public.tags          enable row level security;
alter table public.note_types    enable row level security;
alter table public.review_events enable row level security;
alter table public.pages         enable row level security;

drop policy if exists "mis apuntes" on public.pages;
create policy "mis apuntes" on public.pages
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "perfiles visibles" on public.profiles;
create policy "perfiles visibles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "editar mi perfil" on public.profiles;
create policy "editar mi perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "ver mazos" on public.decks;
create policy "ver mazos" on public.decks
  for select to authenticated using (owner = auth.uid() or is_public);
drop policy if exists "crear mazos" on public.decks;
create policy "crear mazos" on public.decks
  for insert to authenticated with check (owner = auth.uid());
drop policy if exists "editar mis mazos" on public.decks;
create policy "editar mis mazos" on public.decks
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "borrar mis mazos" on public.decks;
create policy "borrar mis mazos" on public.decks
  for delete to authenticated using (owner = auth.uid());

drop policy if exists "ver tarjetas" on public.cards;
create policy "ver tarjetas" on public.cards
  for select to authenticated using (
    owner = auth.uid()
    or exists (select 1 from public.decks d where d.id = deck_id and d.is_public)
  );
drop policy if exists "crear tarjetas" on public.cards;
create policy "crear tarjetas" on public.cards
  for insert to authenticated with check (
    owner = auth.uid()
    and exists (select 1 from public.decks d where d.id = deck_id and d.owner = auth.uid())
  );
drop policy if exists "editar mis tarjetas" on public.cards;
create policy "editar mis tarjetas" on public.cards
  for update to authenticated using (owner = auth.uid()) with check (
    owner = auth.uid()
    and exists (select 1 from public.decks d where d.id = deck_id and d.owner = auth.uid())
  );
drop policy if exists "borrar mis tarjetas" on public.cards;
create policy "borrar mis tarjetas" on public.cards
  for delete to authenticated using (owner = auth.uid());

drop policy if exists "mi progreso" on public.progress;
create policy "mi progreso" on public.progress
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "mi registro" on public.review_log;
create policy "mi registro" on public.review_log
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "mis ajustes" on public.settings;
create policy "mis ajustes" on public.settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "mis carpetas" on public.folders;
create policy "mis carpetas" on public.folders
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "mis etiquetas" on public.tags;
create policy "mis etiquetas" on public.tags
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "mis tipos" on public.note_types;
create policy "mis tipos" on public.note_types
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "mis respuestas" on public.review_events;
create policy "mis respuestas" on public.review_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Contador diario de repasos: suma (o resta, al deshacer) de forma atómica en el servidor, para que
-- dos dispositivos que estudian el mismo día no se pisen el contador. Se ejecuta con los permisos del
-- usuario (security invoker), así que la política «mi registro» sigue aplicándose.
create or replace function public.bump_review_log(p_day date, p_delta int)
returns int language sql security invoker set search_path = public as $$
  insert into public.review_log as l (user_id, day, count)
  values (auth.uid(), p_day, greatest(p_delta, 0))
  on conflict (user_id, day) do update set count = greatest(0, l.count + p_delta)
  returning count;
$$;
grant execute on function public.bump_review_log(date, int) to authenticated;
