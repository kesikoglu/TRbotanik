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
