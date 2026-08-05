-- TRbotanik — kullanıcı hesapları ve saha gözlemleri şeması
--
-- TAŞINABİLİRLİK NOTU: Bu şema düz PostgreSQL'dir. Supabase'e özgü tek bağımlılık
-- `auth.users` tablosu ve `auth.uid()` fonksiyonudur (GoTrue) — ikisi de Supabase'in
-- kendi sunucunuzda barındırılan sürümünde de aynıdır. Kurumun kendi VPS'ine geçiş
-- gerektiğinde bu dosya değişmeden çalışır; taşıma bir pg_dump/restore işidir.
--
-- Uygulama: `supabase db push` veya Supabase Studio > SQL Editor'da çalıştırın.

-- ---------------------------------------------------------------------------
-- Davis kareleme — koordinattan türetme
-- ---------------------------------------------------------------------------
-- Kare kodu İSTEMCİDEN ALINMAZ, koordinattan burada türetilir. Nedeni iki katlı:
-- (1) güvenlik — kötü niyetli bir istemci kaydı yanlış kareye yerleştiremesin;
-- (2) tutarlılık — GBIF kayıtları için kullanılan formülün (packages/shared/src/davis.ts,
-- yayınlanmış literatürdeki 10/10 kare atamasıyla doğrulanmış) bire bir aynısı.
create or replace function public.davis_square(lat double precision, lon double precision)
returns text
language sql
immutable
as $$
  with bounded as (
    select
      -- Türkiye sınırlayıcı kutusunun dışı: sessizce bir kareye atama, null dön.
      case when lat is null or lon is null
                or lat < 35.8 or lat > 42.2
                or lon < 25.6 or lon > 44.9
        then null
        -- Grid aralığına sabitle (clamp): Gökçeada gibi uç noktalar en yakın kareye düşsün.
        else least(greatest(lat, 36.0), 42.0 - 1e-9)
      end as clamped_lat,
      case when lat is null or lon is null
                or lat < 35.8 or lat > 42.2
                or lon < 25.6 or lon > 44.9
        then null
        else least(greatest(lon, 26.0), 46.0 - 1e-9)
      end as clamped_lon
  ),
  parts as (
    select
      -- Bantlar güneyden kuzeye: 0 → C (36–38), 1 → B (38–40), 2 → A (40–42)
      (array['C', 'B', 'A'])[floor((clamped_lat - 36.0) / 2.0)::int + 1] as band,
      floor((clamped_lon - 26.0) / 2.0)::int + 1 as raw_column
    from bounded
  )
  select case
    when band is null then null
    -- A bandı 9'da biter (A10 Türkiye dışında kalır); diğerleri 10'da.
    else band || least(greatest(raw_column, 1), case when band = 'A' then 9 else 10 end)::text
  end
  from parts;
$$;

comment on function public.davis_square is
  'Koordinatı Davis karesine (A1–C10) çevirir. packages/shared/src/davis.ts ile birebir aynı formül.';

-- ---------------------------------------------------------------------------
-- Kullanıcı profilleri
-- ---------------------------------------------------------------------------
-- Kayıt politikası: herkes kayıt olabilir, ama hesap `pending` başlar ve bir
-- yönetici onaylayana kadar veri giremez (RLS aşağıda bunu zorlar).
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  institution  text check (institution is null or length(trim(institution)) <= 200),
  role         text not null default 'contributor'
                 check (role in ('admin', 'curator', 'contributor')),
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'suspended')),
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references auth.users on delete set null
);

comment on column public.profiles.role is
  'admin: her şey · curator: gözlem denetler, kullanıcı onaylayamaz · contributor: yalnızca kendi kaydı';
comment on column public.profiles.status is
  'pending: onay bekliyor, veri giremez · approved: aktif · suspended: askıya alınmış';

create index profiles_status_idx on public.profiles (status) where status = 'pending';

-- Kayıt olan her kullanıcı için profil otomatik açılır. display_name kayıt
-- formundan (raw_user_meta_data) gelir; boşsa e-postanın yerel kısmına düşülür.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, institution)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'institution'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS yardımcıları
-- ---------------------------------------------------------------------------
-- `security definer`: bu fonksiyonlar profiles'ı RLS'i atlayarak okur. Aksi hâlde
-- profiles üzerindeki bir politika kendi içinde profiles'ı sorgulayınca sonsuz
-- özyineleme oluşur (PostgreSQL'in bilinen RLS tuzağı).
create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

/* Denetçi = yönetici veya küratör. Gözlem onaylama/reddetme yetkisi budur. */
create or replace function public.is_curator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'curator') and status = 'approved'
  );
$$;

/* Veri girebilir mi — onaylanmış olmak şart, rol fark etmez. */
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- Gözlemler
-- ---------------------------------------------------------------------------
-- Alan adları Darwin Core (TDWG) karşılıklarına yakın tutuldu; ileride veriyi
-- GBIF'e yayınlamak istenirse eşleme doğrudan olsun diye.
create table public.observations (
  id            uuid primary key default gen_random_uuid(),

  -- Takson. gbif_key null olabilir: arazide teşhis edilememiş örnek de kaydedilebilmeli.
  gbif_key        bigint,
  scientific_name text not null check (length(trim(scientific_name)) between 2 and 200),
  vernacular_name text,

  -- Konum (Darwin Core: decimalLatitude/decimalLongitude/coordinateUncertaintyInMeters)
  lat                      double precision not null check (lat between -90 and 90),
  lon                      double precision not null check (lon between -180 and 180),
  coordinate_uncertainty_m integer check (coordinate_uncertainty_m is null
                                          or coordinate_uncertainty_m between 0 and 100000),
  elevation_m              integer check (elevation_m is null or elevation_m between -500 and 6000),
  province                 text,
  locality                 text check (locality is null or length(locality) <= 300),
  -- Türetilmiş: istemciden gelmez (yukarıdaki fonksiyon notuna bakın).
  davis_square  text generated always as (public.davis_square(lat, lon)) stored,

  -- Olay (Darwin Core: eventDate / individualCount)
  observed_on      date not null check (observed_on <= current_date and observed_on >= date '1800-01-01'),
  individual_count integer check (individual_count is null or individual_count > 0),
  phenology        text check (phenology is null or phenology in
                     ('vejetatif', 'tomurcuk', 'cicekli', 'meyveli', 'tohumlu', 'kurumus')),
  habitat_note     text check (habitat_note is null or length(habitat_note) <= 1000),
  notes            text check (notes is null or length(notes) <= 2000),

  -- İş akışı
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'suspended')),
  created_by  uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 1000)
);

comment on column public.observations.davis_square is
  'Koordinattan türetilir (generated column) — istemci kendi karesini belirleyemez.';
comment on column public.observations.status is
  'pending: onay bekliyor (haritada görünmez) · approved: yayında · rejected/suspended: gizli';

create index observations_status_idx        on public.observations (status);
create index observations_created_by_idx    on public.observations (created_by);
create index observations_gbif_key_idx      on public.observations (gbif_key) where gbif_key is not null;
create index observations_davis_square_idx  on public.observations (davis_square);
-- Haritanın okuduğu sorgu: yalnızca onaylanmış kayıtlar, tarihe göre.
create index observations_approved_idx      on public.observations (observed_on desc)
  where status = 'approved';

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger observations_touch_updated_at
  before update on public.observations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Gözlem fotoğrafları
-- ---------------------------------------------------------------------------
-- İkili veri Supabase Storage'da (`observation-photos` kovası) durur; burada
-- yalnızca yol ve üstveri tutulur.
create table public.observation_photos (
  id             uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations on delete cascade,
  storage_path   text not null unique,
  caption        text check (caption is null or length(caption) <= 300),
  sort_order     smallint not null default 0,
  width          integer,
  height         integer,
  bytes          integer,
  created_at     timestamptz not null default now()
);

create index observation_photos_observation_idx
  on public.observation_photos (observation_id, sort_order);

-- ---------------------------------------------------------------------------
-- Satır bazlı güvenlik (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.observations       enable row level security;
alter table public.observation_photos enable row level security;

-- --- profiles --------------------------------------------------------------
-- Katkıda bulunanın adı gözlem kartında görüneceği için profiller herkese açık
-- okunur. E-posta burada DEĞİL, auth.users'da durur ve dışarı sızmaz.
create policy profiles_select_all on public.profiles
  for select using (true);

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Kullanıcı kendi rolünü/durumunu yükseltemez; yalnızca ad ve kurum değişir.
    and role = public.current_role_name()
    and status = (select status from public.profiles where id = auth.uid())
  );

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- --- observations ----------------------------------------------------------
-- Onaylanmış kayıtlar herkese (giriş yapmamışlara da) açıktır — halka açık harita.
create policy observations_select_approved on public.observations
  for select using (status = 'approved');

create policy observations_select_own on public.observations
  for select using (created_by = auth.uid());

create policy observations_select_curator on public.observations
  for select using (public.is_curator());

-- Yalnızca ONAYLANMIŞ kullanıcı, KENDİ adına, `pending` olarak kayıt açabilir.
-- `status = 'pending'` kontrolü kritik: aksi hâlde istemci kendi kaydını
-- doğrudan 'approved' yollayıp denetimi atlardı.
create policy observations_insert_approved_user on public.observations
  for insert with check (
    public.is_approved()
    and created_by = auth.uid()
    and status = 'pending'
  );

-- Sahibi kaydını yalnızca denetlenmeden ÖNCE düzeltebilir ve durumunu değiştiremez.
create policy observations_update_own_pending on public.observations
  for update using (created_by = auth.uid() and status = 'pending')
  with check (created_by = auth.uid() and status = 'pending');

create policy observations_update_curator on public.observations
  for update using (public.is_curator()) with check (public.is_curator());

create policy observations_delete_own_pending on public.observations
  for delete using (created_by = auth.uid() and status = 'pending');

create policy observations_delete_admin on public.observations
  for delete using (public.is_admin());

-- --- observation_photos ----------------------------------------------------
-- Fotoğraf görünürlüğü bağlı olduğu gözlemin görünürlüğünü izler.
create policy observation_photos_select on public.observation_photos
  for select using (
    exists (
      select 1 from public.observations o
      where o.id = observation_id
        and (o.status = 'approved' or o.created_by = auth.uid() or public.is_curator())
    )
  );

create policy observation_photos_insert_own on public.observation_photos
  for insert with check (
    exists (
      select 1 from public.observations o
      where o.id = observation_id and o.created_by = auth.uid() and o.status = 'pending'
    )
  );

create policy observation_photos_delete_own on public.observation_photos
  for delete using (
    exists (
      select 1 from public.observations o
      where o.id = observation_id and o.created_by = auth.uid() and o.status = 'pending'
    )
  );

create policy observation_photos_admin_all on public.observation_photos
  for all using (public.is_admin()) with check (public.is_admin());
