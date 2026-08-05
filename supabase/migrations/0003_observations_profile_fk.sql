-- observations.created_by → profiles yabancı anahtarı
--
-- SORUN: `created_by` doğrudan `auth.users`'a bakıyordu. Denetim kuyruğu
-- kaydı ekleyenin adını göstermek için PostgREST'ten şu birleştirmeyi istiyor:
--
--     observations?select=*,profiles!observations_created_by_fkey(display_name,...)
--
-- PostgREST bu gömmeyi YABANCI ANAHTAR ÜST VERİSİNDEN çözer. observations ile
-- profiles arasında tanımlı bir ilişki olmadığı için sorgu
-- "Could not find a relationship between 'observations' and 'profiles'" hatası
-- veriyordu — yani onay bekleyen kayıtlar denetim panelinde HİÇ görünmüyordu.
--
-- ÇÖZÜM: Anahtar `public.profiles(id)`'ye yönlendiriliyor. Davranış aynı kalır:
-- profiles.id zaten auth.users'a `on delete cascade` ile bağlı, dolayısıyla bir
-- kullanıcı silindiğinde profili, onunla birlikte gözlemleri de silinir —
-- yalnızca zincir bir halka uzuyor.
--
-- Kısıt adı KASITLI olarak korunuyor (observations_created_by_fkey): istemcideki
-- gömme ipucu bu adı kullanıyor.

alter table public.observations
  drop constraint if exists observations_created_by_fkey;

alter table public.observations
  add constraint observations_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete cascade;

-- Denetçi ve onaylayan alanları da aynı sebeple profiles'a bağlanır: ileride
-- "kimin onayladığı" gösterilmek istendiğinde ek bir şema değişikliği gerekmesin.
-- `on delete set null`: denetçi hesabı silinse de kayıt ve denetim durumu durur.
alter table public.observations
  drop constraint if exists observations_reviewed_by_fkey;

alter table public.observations
  add constraint observations_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles (id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_approved_by_fkey;

alter table public.profiles
  add constraint profiles_approved_by_fkey
  foreign key (approved_by) references public.profiles (id) on delete set null;
