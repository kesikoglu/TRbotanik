-- Tür referans galerisine yükseltilmiş topluluk fotoğrafları
--
-- BAĞLAM: Tür detay panelindeki galeri (`PlantDetail.images`) statik bir
-- artefakttan (public/data/details/shard-*.json) gelir — GBIF/iNaturalist/
-- Wikimedia'dan derlenip ingest sırasında üretilir. Kullanıcıların "Gözlem
-- ekle" ile yükledikleri fotoğraflar bu artefaktın PARÇASI DEĞİLDİR ve statik
-- veriyi yeniden derlemeden oraya giremez.
--
-- Bu tablo, onaylanmış bir topluluk gözleminin fotoğrafını bir KÜRATÖRÜN
-- kararıyla tür galerisine EKLER — kaynak GBIF/iNat verisiyle aynı
-- artefaktın bir parçası olmadan, uygulamanın topluluk katmanı gibi canlı
-- olarak istemci tarafında birleştirilir (bkz. backend/speciesPhotos.ts,
-- useCommunityOccurrences.ts'teki desenle aynı).
--
-- KALICILIK: Fotoğraf `observation-photos` kovasından KOPYALANIR, referans
-- verilmez. Nedeni: özgün fotoğrafın sahibi kendi klasöründeki dosyayı
-- istediği an silebilir (bkz. 0002_storage.sql'deki depolama silme politikası
-- — gözlem onaylansa bile kullanıcı DOSYAYI silebilir). Tür galerisi kalıcı,
-- atıf yapılabilir referans veri olduğu için özgün gözlemin ömründen
-- BAĞIMSIZ olmalı.

-- ---------------------------------------------------------------------------
-- Kova
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'species-photos',
  'species-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists species_photos_read   on storage.objects;
drop policy if exists species_photos_write  on storage.objects;

create policy species_photos_read on storage.objects
  for select using (bucket_id = 'species-photos');

-- Yazma (yükleme/silme) yalnızca küratör/yönetici — burası herkesin kendi
-- klasörüne yazdığı observation-photos'un aksine, tamamen küratör kontrolünde
-- kalması gereken bir referans galeri.
create policy species_photos_write on storage.objects
  for all to authenticated
  using (bucket_id = 'species-photos' and public.is_curator())
  with check (bucket_id = 'species-photos' and public.is_curator());

-- ---------------------------------------------------------------------------
-- Tablo
-- ---------------------------------------------------------------------------
create table public.species_photos (
  id          uuid primary key default gen_random_uuid(),

  -- Takson eşleştirme: uygulama önce gbif_key, sonra scientific_name dener
  -- (bkz. communityOccurrences.ts'teki buildTaxonIndex — aynı desen).
  gbif_key        bigint,
  scientific_name text not null check (length(trim(scientific_name)) between 2 and 200),

  -- Köken — izlenebilirlik için tutulur ama BAĞLI DEĞİLDİR: kaynak gözlem
  -- veya fotoğraf silinse bile bu satır (ve kopyalanmış dosya) kalıcıdır.
  source_observation_id uuid references public.observations on delete set null,
  source_photo_id        uuid references public.observation_photos on delete set null,

  storage_path text not null unique,
  caption      text check (caption is null or length(caption) <= 300),
  width        integer,
  height       integer,
  bytes        integer,

  -- Katkıda bulunanın adı YÜKSELTME ANINDA kopyalanır (denormalize): profil
  -- daha sonra silinse/yeniden adlandırılsa da atıf metni sabit kalır.
  contributor_name text,
  license           text not null default 'CC-BY',

  sort_order   smallint not null default 0,
  promoted_by  uuid not null references auth.users on delete cascade,
  promoted_at  timestamptz not null default now()
);

comment on table public.species_photos is
  'Küratör onayıyla tür referans galerisine yükseltilmiş topluluk gözlem fotoğrafları.';

create index species_photos_gbif_key_idx on public.species_photos (gbif_key) where gbif_key is not null;
-- Aynı özgün fotoğrafın iki kez yükseltilmesini engeller (source_photo_id
-- doluyken); null'lar bu kısıttan muaftır (kaynak fotoğraf ayrıca silinmiş
-- kayıtlar için de yeni satır eklenebilsin diye tekilliği yalnızca doluyken zorlarız).
create unique index species_photos_source_photo_unique_idx
  on public.species_photos (source_photo_id) where source_photo_id is not null;

alter table public.species_photos enable row level security;

-- Herkese açık referans veri — onaylı gözlemler gibi anon da okur.
create policy species_photos_select_all on public.species_photos
  for select using (true);

create policy species_photos_curator_write on public.species_photos
  for all using (public.is_curator()) with check (public.is_curator());

grant select                 on public.species_photos to anon, authenticated;
grant insert, update, delete on public.species_photos to authenticated;
