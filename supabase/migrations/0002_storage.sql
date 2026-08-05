-- Gözlem fotoğrafları için depolama kovası ve erişim kuralları.
--
-- Yol düzeni:  {kullanıcı_id}/{gözlem_id}/{dosya}
-- İlk segmentin kullanıcı kimliği olması kasıtlıdır: aşağıdaki politikalar
-- `storage.foldername(name)[1]` ile bir kullanıcının YALNIZCA kendi klasörüne
-- yazabildiğini doğrular. Başka türlü bir kullanıcı başkasının fotoğrafının
-- üzerine yazabilirdi.

-- ---------------------------------------------------------------------------
-- Kova
-- ---------------------------------------------------------------------------
-- `public = true`: dosyalar CDN üzerinden doğrudan, imzalı adres almadan okunur.
--
-- BİLİNÇLİ ÖDÜNLEŞİM: Kova herkese açık olduğu için, henüz onaylanmamış (veya
-- reddedilmiş) bir gözlemin fotoğrafı da doğrudan adresi bilen biri tarafından
-- görülebilir. Adresler tahmin edilemez (uuid) ve içerik halka açık yayınlanmak
-- üzere toplanan bitki fotoğraflarıdır — hassas veri değildir. Karşılığında
-- fotoğraflar CDN'den önbelleklenerek gelir; özel kova + imzalı adres seçeneği
-- her görsel için ek bir ağ turu ve süresi dolan bağlantılar demek olurdu.
-- Hassas içerik söz konusu olursa burası `false` yapılıp imzalı adrese geçilmelidir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'observation-photos',
  'observation-photos',
  true,
  5242880, -- 5 MB; istemci zaten yüklemeden önce küçültüyor
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Erişim kuralları
-- ---------------------------------------------------------------------------
drop policy if exists observation_photos_read   on storage.objects;
drop policy if exists observation_photos_upload on storage.objects;
drop policy if exists observation_photos_delete on storage.objects;
drop policy if exists observation_photos_admin  on storage.objects;

-- Okuma: kova zaten herkese açık; bu politika API üzerinden listelemeyi de açar.
create policy observation_photos_read on storage.objects
  for select using (bucket_id = 'observation-photos');

-- Yükleme: yalnızca ONAYLANMIŞ kullanıcı ve yalnızca KENDİ klasörüne.
create policy observation_photos_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'observation-photos'
    and public.is_approved()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Silme: kullanıcı yalnızca kendi klasöründen siler.
create policy observation_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'observation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Yönetici her şeyi yapabilir (ör. uygunsuz içerik kaldırma).
create policy observation_photos_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'observation-photos' and public.is_admin())
  with check (bucket_id = 'observation-photos' and public.is_admin());
