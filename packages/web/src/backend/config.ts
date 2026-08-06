/**
 * Arka uç (Supabase) bağlantı ayarları.
 *
 * ANAHTAR NEDEN KAYNAK KODDA: `anon` anahtarı gizli DEĞİLDİR — tasarımı gereği
 * herkese açıktır ve zaten her ziyaretçinin indirdiği JavaScript paketinin içinde
 * yolculuk eder. Gizlenecek bir şey olmadığı için ortam değişkeni yönetimiyle
 * uğraşmak yerine buraya yazılıdır; böylece geliştirme, üretim derlemesi, testler
 * ve tek dosyalık artefakt derlemesi ek yapılandırma olmadan çalışır.
 *
 * Güvenliği bu anahtar DEĞİL, veritabanındaki satır bazlı güvenlik (RLS)
 * politikaları sağlar — bkz. supabase/migrations/0001_init.sql ve onları sınayan
 * supabase/tests/rls.test.sql.
 *
 * GİZLİ OLAN `service_role` anahtarıdır; o tüm politikaları atlar ve BU DEPOYA
 * ASLA GİRMEMELİDİR. İstemci tarafında hiçbir işi de yoktur.
 *
 * Kurum kendi sunucusuna (self-hosted Supabase veya Postgres+PostgREST) geçtiğinde
 * yalnızca aşağıdaki iki ortam değişkeni tanımlanır; kodun geri kalanı değişmez.
 */
export const SUPABASE_URL: string =
  import.meta.env['VITE_SUPABASE_URL'] || 'https://icqghseimvjyslotxjbv.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env['VITE_SUPABASE_ANON_KEY'] ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcWdoc2VpbXZqeXNsb3R4amJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzEyOTksImV4cCI6MjEwMTUwNzI5OX0.oJmc8jrqXQytbNjvilB9dtE4mElhvS8Q7h9ZIvvYy2k';

/**
 * Arka uç yapılandırılmış mı.
 *
 * Yapılandırılmamışsa uygulama katkı özelliklerini gizler ve haritayı eskisi gibi
 * salt-okunur çalıştırır — arka uç olmadan da tamamen kullanılabilir kalır
 * (e2e testleri ve çevrimdışı gösterimler buna dayanır).
 */
export const isBackendConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Yüklenen fotoğrafların saklandığı kova (bkz. supabase/migrations/0002_storage.sql). */
export const PHOTO_BUCKET = 'observation-photos';

/**
 * Küratör onayıyla tür referans galerisine yükseltilen fotoğrafların kovası
 * (bkz. supabase/migrations/0004_species_photos.sql). Ayrı bir kova olmasının
 * nedeni: buradaki dosyalar özgün gözlemden BAĞIMSIZ, kalıcı referans veridir —
 * `observation-photos`'taki gibi katkıda bulunanın kendi klasöründen silinemez.
 */
export const SPECIES_PHOTO_BUCKET = 'species-photos';
