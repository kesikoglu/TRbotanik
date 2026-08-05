-- Supabase'in `auth` şemasının test taklidi.
--
-- Üretimde bu şemayı Supabase (GoTrue) sağlar; test veritabanında yoktur.
-- Burada yalnızca şemamızın gerçekten kullandığı iki şey kurulur:
--   * auth.users  — profiles ve observations'ın yabancı anahtar hedefi
--   * auth.uid()  — RLS politikalarının okuduğu "oturumdaki kullanıcı"
--
-- Testte oturum, `set_config('app.current_user_id', ...)` ile taklit edilir.
-- BU DOSYA ÜRETİME UYGULANMAZ — yalnızca supabase/tests/ altındaki testler içindir.

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- --- storage şemasının taklidi ---------------------------------------------
-- Üretimde storage-api tarafından sağlanır. 0002_storage.sql'in yazdığı kova
-- kaydı ve okuduğu `storage.foldername()` yardımcısı burada karşılanır.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets,
  name      text not null,
  owner     uuid
);

alter table storage.objects enable row level security;

-- Gerçek uygulamayla aynı davranış: yolu '/' ile böler, SON parçayı (dosya adı)
-- atar ve klasör segmentlerini dizi olarak döner.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;
