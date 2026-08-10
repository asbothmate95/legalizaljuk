-- =========================================================
-- Legalizáljuk — Supabase adatbázis-séma
-- =========================================================
-- Ezt a fájlt a Supabase projekt SQL Editorába bemásolva, "Run"-nal
-- egy az egyben lefuttathatod. Végigmegy:
--   1) leads tábla létrehozásán (mindkét űrlap adatai ide kerülnek)
--   2) Row Level Security (RLS) beállításán — a weboldal csak ÚJ sort
--      tud beszúrni (INSERT), OLVASNI / MÓDOSÍTANI / TÖRÖLNI nem tud
--      semmit, még akkor sem, ha valaki kiolvasná a publikus anon kulcsot
--      a weboldal forráskódjából. Ez biztonságos, szándékos beállítás.
--   3) egy adatbázis-triggeren, ami minden ÚJ lead-nél automatikusan
--      meghívja a send-lead-email Edge Function-t (ez küldi ki az
--      e-maileket) — így a levélküldés a beszúrás pillanatában, szerver-
--      oldalon, kódszinten történik, nem a látogató böngészőjéből.
-- =========================================================

-- ---------- 1) TÁBLA ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- "book"  = ingyenes e-könyv űrlap (popup)
  -- "consult" = ingyenes/fizetős konzultáció-kvíz űrlap
  type text not null check (type in ('book', 'consult')),

  -- közös mezők
  email text,
  phone text,
  newsletter_optin boolean not null default false,

  -- csak "consult" típusnál kitöltött mezők
  building_type text,
  built_period text,
  for_residence text,
  settlement text,
  house_number text,
  name text,
  message text,

  -- megjelöli, hogy a kapcsolódó e-mail(ek) kiküldése sikerült-e —
  -- hibakereséshez / utólagos ellenőrzéshez hasznos
  email_status text not null default 'pending',
  email_error text
);

comment on table public.leads is 'Legalizáljuk weboldal — érdeklődői adatok (könyv-igénylés + konzultáció-kvíz)';

-- ---------- 2) ROW LEVEL SECURITY ----------
alter table public.leads enable row level security;

-- a publikus (anon) kulcs csak ÚJ SOR BESZÚRÁSÁRA jogosult
drop policy if exists "anon can insert leads" on public.leads;
create policy "anon can insert leads"
  on public.leads
  for insert
  to anon
  with check (true);

-- olvasás / módosítás / törlés SENKINEK sincs engedélyezve az anon
-- kulccsal — a leadeket a Supabase Dashboard "Table Editor" nézetében,
-- bejelentkezve tudod megnézni (ott a service_role jogosultsággal
-- mindent látsz), a weboldal látogatói és a publikus kulcs viszont nem.

-- ---------- 3) TRIGGER — automatikus e-mail-küldés minden új lead-nél ----------
-- A pg_net kiterjesztés a Supabase projektekben alapból elérhető, csak
-- be kell kapcsolni (Database → Extensions → pg_net → Enable), vagy az
-- alábbi paranccsal:
create extension if not exists pg_net with schema extensions;

-- FONTOS: a <PROJECT_REF> és <ANON_KEY> helyére a saját Supabase
-- projekted adatait kell beírnod (Project Settings → API oldalon
-- találod mindkettőt), MIELŐTT lefuttatod ezt a fájlt.
create or replace function public.notify_lead_email()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-lead-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

drop trigger if exists on_lead_created on public.leads;
create trigger on_lead_created
  after insert on public.leads
  for each row
  execute function public.notify_lead_email();
