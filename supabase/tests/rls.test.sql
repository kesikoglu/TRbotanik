-- RLS politikalarının davranış testi.
--
-- NEDEN GEREKLİ: RLS'teki bir hata sessiz bir güvenlik açığıdır — uygulama
-- çalışmaya devam eder, sadece yetkisiz kişi veri yazar/okur. Bu yüzden her
-- politika, gerçek bir PostgreSQL üzerinde `set role authenticated` ile
-- gerçek bir yetkisiz oturum taklit edilerek sınanır.
--
-- Çalıştırma (yerel doğrulama; CI'da postgres servisi ile):
--   psql -d trbotanik -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
--
-- Her `assert` başarısız olursa script hata verip durur.

\set ON_ERROR_STOP on
set client_min_messages to warning;

-- --- İzinler ---------------------------------------------------------------
-- DİKKAT: `public` şemasındaki tablo/fonksiyon izinleri KASITLI olarak burada
-- verilmez — onları 0001_init.sql'in kendisi verir. Böylece bu test, migration'ın
-- gerçek izinlerini sınar; testin kendi verdiği izinler doğru sonucu taklit edip
-- eksik bir GRANT'i gizleyemez.
--
-- Aşağıdakiler yalnızca üretimde Supabase'in sağladığı, bizim migration'ımızın
-- sorumluluğunda olmayan şemalar içindir (bkz. auth-stub.sql).
grant usage on schema auth to anon, authenticated;
grant select on auth.users to anon, authenticated;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
grant execute on all functions in schema storage to anon, authenticated;

-- --- Test kullanıcıları ----------------------------------------------------
delete from public.observations;
delete from public.profiles;
delete from auth.users;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@uni.edu.tr'),
  ('22222222-2222-2222-2222-222222222222', 'onayli@uni.edu.tr'),
  ('33333333-3333-3333-3333-333333333333', 'bekleyen@uni.edu.tr'),
  ('44444444-4444-4444-4444-444444444444', 'kurator@uni.edu.tr');

update public.profiles set role = 'admin',   status = 'approved' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'contributor', status = 'approved' where id = '22222222-2222-2222-2222-222222222222';
-- 33333333 kasıtlı olarak 'pending' bırakılır (varsayılan)
update public.profiles set role = 'curator', status = 'approved' where id = '44444444-4444-4444-4444-444444444444';

do $$
declare
  admin_id  uuid := '11111111-1111-1111-1111-111111111111';
  ok_id     uuid := '22222222-2222-2222-2222-222222222222';
  pending_id uuid := '33333333-3333-3333-3333-333333333333';
  curator_id uuid := '44444444-4444-4444-4444-444444444444';
  obs_id    uuid;
  n         integer;
  failed    boolean;
begin
  -- Trigger her kullanıcı için profil açtı mı?
  select count(*) into n from public.profiles;
  assert n = 4, format('handle_new_user tetikleyicisi 4 profil açmalıydı, %s açtı', n);

  -- =========================================================================
  -- 1) ONAY BEKLEYEN kullanıcı gözlem GİREMEZ
  -- =========================================================================
  set local role authenticated;
  perform set_config('app.current_user_id', pending_id::text, true);
  failed := false;
  begin
    insert into public.observations (scientific_name, lat, lon, observed_on, created_by)
    values ('Astragalus microcephalus', 39.9, 32.8, current_date, pending_id);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'Onay bekleyen kullanıcı gözlem girebildi — RLS açığı!';
  reset role;

  -- =========================================================================
  -- 2) ONAYLANMIŞ kullanıcı KENDİ adına 'pending' kayıt açabilir
  -- =========================================================================
  set local role authenticated;
  perform set_config('app.current_user_id', ok_id::text, true);
  insert into public.observations (scientific_name, lat, lon, observed_on, created_by)
  values ('Astragalus microcephalus', 39.9334, 32.8597, current_date, ok_id)
  returning id into obs_id;
  assert obs_id is not null, 'Onaylı kullanıcı kayıt açamadı';

  -- Davis karesi koordinattan TÜRETİLDİ mi?
  select count(*) into n from public.observations where id = obs_id and davis_square = 'B4';
  assert n = 1, 'davis_square koordinattan B4 olarak türetilmeliydi';

  -- =========================================================================
  -- 3) Kullanıcı kaydını doğrudan 'approved' olarak AÇAMAZ (denetimi atlayamaz)
  -- =========================================================================
  failed := false;
  begin
    insert into public.observations (scientific_name, lat, lon, observed_on, created_by, status)
    values ('Hile denemesi', 39.9, 32.8, current_date, ok_id, 'approved');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'Kullanıcı kendi kaydını doğrudan onaylı açabildi — denetim atlanıyor!';

  -- =========================================================================
  -- 4) Kullanıcı BAŞKASI adına kayıt açamaz
  -- =========================================================================
  failed := false;
  begin
    insert into public.observations (scientific_name, lat, lon, observed_on, created_by)
    values ('Sahtecilik', 39.9, 32.8, current_date, curator_id);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'Kullanıcı başkası adına kayıt açabildi — RLS açığı!';

  -- =========================================================================
  -- 5) Kullanıcı KENDİ kaydını onaylayamaz
  -- =========================================================================
  -- Not: satır USING koşulunu geçer (status='pending'), ama yeni değer WITH CHECK'e
  -- takılır — PostgreSQL bunu sessizce yutmaz, hata fırlatır. İstenen davranış budur.
  failed := false;
  begin
    update public.observations set status = 'approved' where id = obs_id;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'Kullanıcı kendi kaydını onaylayabildi — denetim atlanıyor!';
  reset role;
  select count(*) into n from public.observations where id = obs_id and status = 'approved';
  assert n = 0, 'Kayıt yine de onaylı duruma geçmiş — denetim atlanıyor!';

  -- =========================================================================
  -- 6) Kullanıcı kendi ROLÜNÜ yükseltemez
  -- =========================================================================
  set local role authenticated;
  perform set_config('app.current_user_id', ok_id::text, true);
  failed := false;
  begin
    update public.profiles set role = 'admin' where id = ok_id;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'Kullanıcı kendini yönetici yapabildi — yetki yükseltme açığı!';
  reset role;
  select count(*) into n from public.profiles where id = ok_id and role = 'admin';
  assert n = 0, 'Rol yine de admin olmuş — yetki yükseltme açığı!';

  -- =========================================================================
  -- 7) KÜRATÖR kaydı onaylayabilir
  -- =========================================================================
  set local role authenticated;
  perform set_config('app.current_user_id', curator_id::text, true);
  update public.observations set status = 'approved', reviewed_by = curator_id, reviewed_at = now()
  where id = obs_id;
  reset role;
  select count(*) into n from public.observations where id = obs_id and status = 'approved';
  assert n = 1, 'Küratör kaydı onaylayamadı';

  -- =========================================================================
  -- 8) GİRİŞ YAPMAMIŞ ziyaretçi yalnızca ONAYLI kayıtları görür
  -- =========================================================================
  -- Onaylanmamış ikinci bir kayıt ekle (onaylı kullanıcı adına)
  set local role authenticated;
  perform set_config('app.current_user_id', ok_id::text, true);
  insert into public.observations (scientific_name, lat, lon, observed_on, created_by)
  values ('Henuz onaylanmamis', 39.0, 33.0, current_date, ok_id);
  reset role;

  set local role anon;
  perform set_config('app.current_user_id', '', true);
  select count(*) into n from public.observations;
  reset role;
  assert n = 1, format('Ziyaretçi yalnızca 1 onaylı kaydı görmeliydi, %s kayıt gördü — sızıntı!', n);

  -- =========================================================================
  -- 9) Sahibi KENDİ onaylanmamış kaydını görebilir (toplam 2)
  -- =========================================================================
  set local role authenticated;
  perform set_config('app.current_user_id', ok_id::text, true);
  select count(*) into n from public.observations;
  reset role;
  assert n = 2, format('Sahibi kendi 2 kaydını görmeliydi, %s gördü', n);

  -- =========================================================================
  -- 10) Onaylandıktan sonra sahibi kaydı DEĞİŞTİREMEZ
  -- =========================================================================
  set local role authenticated;
  perform set_config('app.current_user_id', ok_id::text, true);
  update public.observations set notes = 'sonradan degistirildi' where id = obs_id;
  reset role;
  select count(*) into n from public.observations where id = obs_id and notes is null;
  assert n = 1, 'Sahibi onaylanmış kaydı değiştirebildi — denetim sonrası bütünlük yok!';

  -- =========================================================================
  -- 11) Fotoğraf deposu: kullanıcı YALNIZCA kendi klasörüne yükleyebilir
  -- =========================================================================
  -- Yol düzeni {kullanıcı_id}/{gözlem_id}/{dosya}; ilk segment sahibi belirler.
  set local role authenticated;
  perform set_config('app.current_user_id', ok_id::text, true);

  -- Kendi klasörü: başarılı olmalı
  insert into storage.objects (bucket_id, name)
  values ('observation-photos', ok_id::text || '/' || obs_id::text || '/foto.jpg');

  -- Başkasının klasörü: reddedilmeli
  failed := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('observation-photos', curator_id::text || '/calinti/foto.jpg');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'Kullanıcı başkasının fotoğraf klasörüne yazabildi — depolama açığı!';
  reset role;

  -- Onay bekleyen kullanıcı hiç yükleyememeli
  set local role authenticated;
  perform set_config('app.current_user_id', pending_id::text, true);
  failed := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('observation-photos', pending_id::text || '/x/foto.jpg');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'Onay bekleyen kullanıcı fotoğraf yükleyebildi — depolama açığı!';
  reset role;

  -- `warning` seviyesi kasıtlı: yukarıdaki `client_min_messages = warning`
  -- ayarı notice'ları gizler, bu satırın çıktıda GÖRÜNMESİ gerekir.
  raise warning 'TÜM RLS TESTLERİ GEÇTİ (11/11)';
end $$;
