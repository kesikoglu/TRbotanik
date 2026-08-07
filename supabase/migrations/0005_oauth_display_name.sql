-- Google (ve ileride Apple) ile girişte profil adı türetme
--
-- SORUN: `handle_new_user` yalnızca `raw_user_meta_data.display_name`'e
-- bakıyordu — bu alan yalnızca bizim kayıt formumuzun gönderdiği özel bir
-- alan. Google OAuth ile girişte Supabase bunun yerine `full_name` (ve bazı
-- akışlarda `name`) alanını doldurur; `display_name` hiç gelmez. Değişiklik
-- olmadan Google ile kayıt olan her kullanıcının adı e-postanın @ öncesi
-- kısmına düşerdi (mevcut son çare), oysa Google zaten gerçek adı veriyor.
--
-- ÇÖZÜM: Kontrol sırası e-posta formumuzdan geleni ÖNCELİKLİ tutar (kullanıcı
-- kendi girdiği adı serbestçe düzenleyebilsin diye), sonra Google'ın
-- `full_name`/`name` alanlarına, en son e-posta ön ekine düşer.

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
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'institution'), '')
  );
  return new;
end;
$$;
