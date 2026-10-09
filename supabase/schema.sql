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
-- Etiquetas de los apuntes (versión 6): las mismas que las de los mazos
alter table public.pages add column if not exists tags uuid[] not null default '{}';
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

-- ---------- Imágenes (versión 7) ----------
-- Almacén privado: cada cuenta guarda sus imágenes en su carpeta (<id de usuario>/<id de imagen>)
-- y solo ella puede verlas. Máximo 8 MB por imagen (la app ya las reduce a unos 200 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 8388608, array['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mis imágenes: ver" on storage.objects;
create policy "mis imágenes: ver" on storage.objects
  for select to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "mis imágenes: subir" on storage.objects;
create policy "mis imágenes: subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "mis imágenes: cambiar" on storage.objects;
create policy "mis imágenes: cambiar" on storage.objects
  for update to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "mis imágenes: borrar" on storage.objects;
create policy "mis imágenes: borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Amigos (versión 8) ----------
-- Cada cuenta tiene un código para invitar (privado: solo lo ve ella) y decide si comparte su actividad.
create table if not exists public.social (
  user_id  uuid primary key references auth.users on delete cascade,
  code     text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  share    boolean not null default true
);
alter table public.social enable row level security;
drop policy if exists "mi código" on public.social;
create policy "mi código" on public.social
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "mi privacidad" on public.social;
create policy "mi privacidad" on public.social
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Amistades: la pide uno (requester) y la acepta el otro (addressee). status: pending · accepted · blocked
create table if not exists public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references auth.users on delete cascade,
  addressee   uuid not null references auth.users on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  blocked_by  uuid references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_idx on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;
-- Se leen las propias; los cambios van por las funciones de abajo, que comprueban cada caso
drop policy if exists "mis amistades" on public.friendships;
create policy "mis amistades" on public.friendships
  for select to authenticated using (requester = auth.uid() or addressee = auth.uid());

-- Ánimos (👏) entre amigos: como mucho uno al día de cada persona a cada amigo
create table if not exists public.cheers (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users on delete cascade,
  to_user    uuid not null references auth.users on delete cascade,
  kind       text not null default 'clap' check (kind in ('clap', 'fire', 'go')),
  day        date not null default current_date,
  seen       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_user, to_user, day)
);
alter table public.cheers enable row level security;
drop policy if exists "mis ánimos" on public.cheers;
create policy "mis ánimos" on public.cheers
  for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists "ánimos vistos" on public.cheers;
create policy "ánimos vistos" on public.cheers
  for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted'
    and ((requester = a and addressee = b) or (requester = b and addressee = a)));
$$;

-- Mi código (se crea la primera vez) y si comparto mi actividad
create or replace function public.my_social()
returns table (code text, share boolean) language plpgsql security definer set search_path = public as $$
declare c text; abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  if not exists (select 1 from social s where s.user_id = auth.uid()) then
    loop
      c := '';
      for i in 1..8 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
      exit when not exists (select 1 from social s where s.code = c);
    end loop;
    insert into social (user_id, code) values (auth.uid(), c) on conflict do nothing;
  end if;
  return query select s.code, s.share from social s where s.user_id = auth.uid();
end;
$$;

-- Compartir (o no) mi actividad con mis amigos
create or replace function public.set_share(p_share boolean)
returns void language sql security definer set search_path = public as $$
  update social set share = p_share where user_id = auth.uid();
$$;

-- Pedir amistad con un código. Si la otra persona ya te la había pedido, quedáis como amigos.
-- Devuelve: 'sent' · 'accepted' · 'already' · 'pending' · 'self' · 'not_found' · 'blocked'
create or replace function public.request_friend(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; f friendships;
begin
  if me is null then raise exception 'sin sesión'; end if;
  select user_id into other from social where code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if other is null then return 'not_found'; end if;
  if other = me then return 'self'; end if;
  select * into f from friendships where least(requester, addressee) = least(me, other) and greatest(requester, addressee) = greatest(me, other);
  if f.id is null then
    insert into friendships (requester, addressee) values (me, other);
    return 'sent';
  end if;
  if f.status = 'blocked' then return 'blocked'; end if;
  if f.status = 'accepted' then return 'already'; end if;
  if f.addressee = me then update friendships set status = 'accepted' where id = f.id; return 'accepted'; end if;
  return 'pending';
end;
$$;

-- Aceptar o rechazar una petición recibida
create or replace function public.respond_friend(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update friendships set status = 'accepted' where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from friendships where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;
-- Quitar a un amigo o cancelar una petición enviada
create or replace function public.remove_friend(p_other uuid)
returns void language sql security definer set search_path = public as $$
  delete from friendships where status <> 'blocked'
    and ((requester = auth.uid() and addressee = p_other) or (requester = p_other and addressee = auth.uid()));
$$;
-- Bloquear: deja de ser amigo y no puede volver a pedírtelo
create or replace function public.block_friend(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_other = me then return; end if;
  if exists (select 1 from friendships where status = 'blocked' and blocked_by = p_other
    and least(requester, addressee) = least(me, p_other) and greatest(requester, addressee) = greatest(me, p_other)) then return; end if;
  delete from friendships where least(requester, addressee) = least(me, p_other) and greatest(requester, addressee) = greatest(me, p_other);
  insert into friendships (requester, addressee, status, blocked_by) values (me, p_other, 'blocked', me);
end;
$$;
create or replace function public.unblock_friend(p_other uuid)
returns void language sql security definer set search_path = public as $$
  delete from friendships where status = 'blocked' and blocked_by = auth.uid()
    and ((requester = auth.uid() and addressee = p_other) or (requester = p_other and addressee = auth.uid()));
$$;

-- Peticiones y bloqueos, con el nombre de la otra persona. dir: 'in' (recibida) · 'out' (enviada) · 'blocked'
create or replace function public.friend_requests()
returns table (id uuid, other uuid, name text, dir text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, case when f.requester = auth.uid() then f.addressee else f.requester end,
    coalesce(p.display_name, ''), case when f.status = 'blocked' then 'blocked' when f.addressee = auth.uid() then 'in' else 'out' end, f.created_at
  from friendships f
  join profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where (f.requester = auth.uid() or f.addressee = auth.uid())
    and (f.status = 'pending' or (f.status = 'blocked' and f.blocked_by = auth.uid()))
  order by f.created_at desc;
$$;

-- Racha de una persona: días seguidos con repasos hasta hoy (o hasta ayer, si hoy aún no ha estudiado)
create or replace function public.streak_of(p_user uuid, p_today date)
returns int language plpgsql stable security definer set search_path = public as $$
declare d date := p_today; n int := 0;
begin
  if not exists (select 1 from review_log where user_id = p_user and day = d and count > 0) then d := d - 1; end if;
  while exists (select 1 from review_log where user_id = p_user and day = d and count > 0) loop
    n := n + 1; d := d - 1;
  end loop;
  return n;
end;
$$;

-- Resumen de cada amigo: solo números ya calculados, y nada si ha elegido no compartir su actividad.
-- p_today: el día de hoy en el dispositivo (los días del registro van en la hora de cada persona).
-- week: repasos de lunes a domingo de esta semana · langs: idiomas de sus mazos (sin nombres de mazos)
create or replace function public.friend_summary(p_today date)
returns table (id uuid, name text, since timestamptz, shared boolean, streak int, today int, week int[], langs text[])
language sql stable security definer set search_path = public as $$
  with fr as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as uid, f.created_at
    from friendships f where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  ), x as (
    select fr.uid, fr.created_at, coalesce(p.display_name, '') as name, coalesce(s.share, true) as shared
    from fr join profiles p on p.id = fr.uid left join social s on s.user_id = fr.uid
  )
  select x.uid, x.name, x.created_at, x.shared,
    case when x.shared then streak_of(x.uid, p_today) else 0 end,
    case when x.shared then coalesce((select l.count from review_log l where l.user_id = x.uid and l.day = p_today), 0) else 0 end,
    case when x.shared then array(select coalesce((select l.count from review_log l where l.user_id = x.uid
      and l.day = p_today - (extract(isodow from p_today)::int - 1) + g), 0) from generate_series(0, 6) g order by g) else '{}'::int[] end,
    case when x.shared then array(select distinct split_part(d.options->>'lang', '-', 1) from decks d
      where d.owner = x.uid and not coalesce(d.archived, false) and coalesce(d.options->>'lang', '') <> '') else '{}'::text[] end
  from x;
$$;

-- Mandar un ánimo a un amigo (repetirlo el mismo día no hace nada)
create or replace function public.send_cheer(p_to uuid, p_kind text default 'clap')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not are_friends(auth.uid(), p_to) then raise exception 'Solo puedes animar a tus amigos'; end if;
  insert into cheers (from_user, to_user, kind) values (auth.uid(), p_to, p_kind) on conflict do nothing;
end;
$$;
-- Ánimos recibidos sin ver (de la última semana), con el nombre de quien los manda
create or replace function public.my_cheers()
returns table (id uuid, name text, kind text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(p.display_name, ''), c.kind, c.created_at from cheers c join profiles p on p.id = c.from_user
  where c.to_user = auth.uid() and not c.seen and c.created_at > now() - interval '7 days' order by c.created_at desc limit 20;
$$;

revoke execute on function public.are_friends(uuid, uuid), public.streak_of(uuid, date) from public, anon, authenticated;
grant execute on function public.my_social(), public.set_share(boolean), public.request_friend(text), public.respond_friend(uuid, boolean),
  public.remove_friend(uuid), public.block_friend(uuid), public.unblock_friend(uuid), public.friend_requests(),
  public.friend_summary(date), public.send_cheer(uuid, text), public.my_cheers() to authenticated;

-- ---------- FSRS (versión 9) ----------
-- El algoritmo FSRS guarda de cada tarjeta su estabilidad (días) y su dificultad (1 a 10)
alter table public.progress add column if not exists stability  real;
alter table public.progress add column if not exists difficulty real;
