/**
 * Fixture takson listesi.
 *
 * DÜRÜSTLÜK NOTU — bu dosyanın en önemli kısmı:
 *
 * Buradaki *adlar ve sınıflandırma* gerçektir; Türkiye florasında bulunan gerçek
 * taksonlardır. Buna karşılık bu taksonların **yayılış noktaları tamamen sentetiktir**
 * (make-fixtures.mjs tarafından tohumlu bir rastgele sayı üreteciyle üretilir) ve
 * gerçek gözlem kaydı değildir.
 *
 * Öznitelikler yalnızca güvenilir biçimde bilindiğinde doldurulmuştur. Emin
 * olunmayan hiçbir alan tahmin edilmemiş, `null` bırakılmıştır — arayüz bu boşlukları
 * "henüz küratörlenmedi" gerekçesiyle gösterir. Bu, hem akademik dürüstlüğü korur
 * hem de gerçek veri geldiğinde tablonun nasıl davranacağını gösterir.
 *
 * Alanlar:
 *   sp        bilimsel ad (tür)
 *   au        yazar kısaltması
 *   fam/ord/cls  familya / takım / sınıf
 *   tr        Türkçe ad(lar)
 *   habit     yaşam formu
 *   endemic   true = Türkiye'ye endemik olduğu kesin, false = kesinlikle değil,
 *             null  = emin değiliz → tabloda "henüz küratörlenmedi"
 *   alt       [min, max] yükselti (m) — yalnızca bilinen durumlarda
 *   flw       [başlangıç, bitiş] çiçeklenme ayı — yalnızca bilinen durumlarda
 *   habitat   kısa habitat tanımı
 */

export const FIXTURE_TAXA = [
  // ── Pinaceae (Pinopsida) ────────────────────────────────────────────────
  { sp: 'Pinus brutia', au: 'Ten.', fam: 'Pinaceae', ord: 'Pinales', cls: 'Pinopsida',
    tr: ['Kızılçam'], habit: 'agac', endemic: false, alt: [0, 1200], flw: [3, 5],
    habitat: 'Akdeniz ve Ege kıyı kuşağı, kalker yamaçlar' },
  { sp: 'Pinus nigra', au: 'J.F.Arnold', fam: 'Pinaceae', ord: 'Pinales', cls: 'Pinopsida',
    tr: ['Karaçam'], habit: 'agac', endemic: false, alt: [400, 2000], flw: [5, 6],
    habitat: 'Dağ ormanları' },
  { sp: 'Cedrus libani', au: 'A.Rich.', fam: 'Pinaceae', ord: 'Pinales', cls: 'Pinopsida',
    tr: ['Toros sediri', 'Lübnan sediri'], habit: 'agac', endemic: false, alt: [800, 2100],
    flw: [9, 10], habitat: 'Toros Dağları kalker yamaçları' },
  { sp: 'Abies nordmanniana', au: '(Steven) Spach', fam: 'Pinaceae', ord: 'Pinales', cls: 'Pinopsida',
    tr: ['Doğu Karadeniz göknarı'], habit: 'agac', endemic: false, alt: [900, 2000], flw: null,
    habitat: 'Karadeniz dağ ormanları' },
  { sp: 'Picea orientalis', au: '(L.) Peterm.', fam: 'Pinaceae', ord: 'Pinales', cls: 'Pinopsida',
    tr: ['Doğu ladini'], habit: 'agac', endemic: false, alt: [1000, 2200], flw: null,
    habitat: 'Doğu Karadeniz nemli dağ ormanları' },

  // ── Fagaceae ────────────────────────────────────────────────────────────
  { sp: 'Quercus cerris', au: 'L.', fam: 'Fagaceae', ord: 'Fagales', cls: 'Magnoliopsida',
    tr: ['Saçlı meşe'], habit: 'agac', endemic: false, alt: null, flw: [4, 5], habitat: 'Kuru ormanlar' },
  { sp: 'Quercus robur', au: 'L.', fam: 'Fagaceae', ord: 'Fagales', cls: 'Magnoliopsida',
    tr: ['Saplı meşe'], habit: 'agac', endemic: false, alt: null, flw: [4, 5], habitat: 'Nemli ormanlar' },
  { sp: 'Fagus orientalis', au: 'Lipsky', fam: 'Fagaceae', ord: 'Fagales', cls: 'Magnoliopsida',
    tr: ['Doğu kayını'], habit: 'agac', endemic: false, alt: [300, 1800], flw: [4, 5],
    habitat: 'Karadeniz nemli ormanları' },
  { sp: 'Castanea sativa', au: 'Mill.', fam: 'Fagaceae', ord: 'Fagales', cls: 'Magnoliopsida',
    tr: ['Kestane'], habit: 'agac', endemic: false, alt: null, flw: [6, 7], habitat: 'Nemli ormanlar' },

  // ── Fabaceae ────────────────────────────────────────────────────────────
  { sp: 'Astragalus microcephalus', au: 'Willd.', fam: 'Fabaceae', ord: 'Fabales', cls: 'Magnoliopsida',
    tr: ['Geven'], habit: 'cali', endemic: null, alt: null, flw: [6, 7], habitat: 'Step ve kuru yamaçlar' },
  { sp: 'Astragalus angustifolius', au: 'Lam.', fam: 'Fabaceae', ord: 'Fabales', cls: 'Magnoliopsida',
    tr: ['Dar yapraklı geven'], habit: 'cali', endemic: null, alt: null, flw: [6, 8],
    habitat: 'Taşlık yamaçlar' },
  { sp: 'Vicia cracca', au: 'L.', fam: 'Fabaceae', ord: 'Fabales', cls: 'Magnoliopsida',
    tr: ['Kuş fiği'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 8], habitat: 'Çayır ve tarla kenarları' },
  { sp: 'Trifolium pratense', au: 'L.', fam: 'Fabaceae', ord: 'Fabales', cls: 'Magnoliopsida',
    tr: ['Çayır üçgülü'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 9], habitat: 'Çayırlar' },
  { sp: 'Onobrychis viciifolia', au: 'Scop.', fam: 'Fabaceae', ord: 'Fabales', cls: 'Magnoliopsida',
    tr: ['Korunga'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 7], habitat: 'Kuru çayır ve step' },

  // ── Asteraceae ──────────────────────────────────────────────────────────
  { sp: 'Centaurea tchihatcheffii', au: 'Fisch. & C.A.Mey.', fam: 'Asteraceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Sevgi çiçeği', 'Ankara çiğdemi'], habit: 'tek-yillik-ot', endemic: true, alt: [750, 1000],
    flw: [5, 6], habitat: 'Ankara çevresi tuzcul step, çok dar yayılışlı' },
  { sp: 'Centaurea solstitialis', au: 'L.', fam: 'Asteraceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Sarı diken', 'Çakırdikeni'], habit: 'tek-yillik-ot', endemic: false, alt: null, flw: [6, 9],
    habitat: 'Bozkır, nadas tarlaları, yol kenarları' },
  { sp: 'Achillea millefolium', au: 'L.', fam: 'Asteraceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Civanperçemi'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [6, 9], habitat: 'Çayır ve yol kenarları' },
  { sp: 'Anthemis tinctoria', au: 'L.', fam: 'Asteraceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Sarı papatya'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [6, 8], habitat: 'Kuru yamaçlar' },
  { sp: 'Tanacetum balsamita', au: 'L.', fam: 'Asteraceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Kafur otu'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: null, habitat: null },
  { sp: 'Tragopogon porrifolius', au: 'L.', fam: 'Asteraceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Yemlik', 'Tekesakalı'], habit: 'iki-yillik-ot', endemic: false, alt: null, flw: [4, 6], habitat: 'Tarla kenarları, step' },

  // ── Lamiaceae ───────────────────────────────────────────────────────────
  { sp: 'Salvia cryptantha', au: 'Montbret & Aucher ex Benth.', fam: 'Lamiaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Anadolu adaçayı'], habit: 'cok-yillik-ot', endemic: true, alt: null, flw: [5, 7],
    habitat: 'İç Anadolu stepleri, kalker yamaçlar' },
  { sp: 'Salvia officinalis', au: 'L.', fam: 'Lamiaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Tıbbi adaçayı'], habit: 'calimsi', endemic: false, alt: null, flw: [5, 7], habitat: 'Kayalık yamaçlar' },
  { sp: 'Origanum onites', au: 'L.', fam: 'Lamiaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['İzmir kekiği', 'Bilyalı kekik'], habit: 'calimsi', endemic: false, alt: [0, 1200], flw: [5, 8],
    habitat: 'Ege ve Akdeniz makilikleri' },
  { sp: 'Origanum vulgare', au: 'L.', fam: 'Lamiaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Güveyotu'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [6, 9], habitat: 'Orman açıklıkları' },
  { sp: 'Thymus sipyleus', au: 'Boiss.', fam: 'Lamiaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Anadolu kekiği'], habit: 'calimsi', endemic: null, alt: null, flw: [6, 8], habitat: 'Kuru taşlık yamaçlar' },
  { sp: 'Lamium album', au: 'L.', fam: 'Lamiaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Ak ballıbaba'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [4, 8], habitat: 'Gölgeli nemli yerler' },
  { sp: 'Mentha longifolia', au: '(L.) L.', fam: 'Lamiaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Dere nanesi'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [6, 9], habitat: 'Dere kenarları, nemli alanlar' },

  // ── Scrophulariaceae ────────────────────────────────────────────────────
  { sp: 'Verbascum olympicum', au: 'Boiss.', fam: 'Scrophulariaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Uludağ sığırkuyruğu'], habit: 'iki-yillik-ot', endemic: true, alt: [1000, 2000], flw: [6, 8],
    habitat: 'Uludağ ve çevresi, taşlık yamaçlar' },
  { sp: 'Verbascum thapsus', au: 'L.', fam: 'Scrophulariaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Sığırkuyruğu'], habit: 'iki-yillik-ot', endemic: false, alt: null, flw: [6, 8], habitat: 'Yol kenarları, bozuk alanlar' },

  // ── Plantaginaceae ──────────────────────────────────────────────────────
  { sp: 'Digitalis ferruginea', au: 'L.', fam: 'Plantaginaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Paslı yüksükotu'], habit: 'iki-yillik-ot', endemic: false, alt: null, flw: [6, 8], habitat: 'Orman açıklıkları' },
  { sp: 'Veronica chamaedrys', au: 'L.', fam: 'Plantaginaceae', ord: 'Lamiales', cls: 'Magnoliopsida',
    tr: ['Yavşan otu'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [4, 6], habitat: 'Çayır ve orman kenarları' },

  // ── Rosaceae ────────────────────────────────────────────────────────────
  { sp: 'Rosa canina', au: 'L.', fam: 'Rosaceae', ord: 'Rosales', cls: 'Magnoliopsida',
    tr: ['Kuşburnu', 'Yabani gül'], habit: 'cali', endemic: false, alt: null, flw: [5, 7], habitat: 'Çalılıklar, orman kenarları' },
  { sp: 'Crataegus monogyna', au: 'Jacq.', fam: 'Rosaceae', ord: 'Rosales', cls: 'Magnoliopsida',
    tr: ['Alıç'], habit: 'cali', endemic: false, alt: null, flw: [4, 6], habitat: 'Çalılıklar' },
  { sp: 'Prunus spinosa', au: 'L.', fam: 'Rosaceae', ord: 'Rosales', cls: 'Magnoliopsida',
    tr: ['Çakal eriği'], habit: 'cali', endemic: false, alt: null, flw: [3, 4], habitat: 'Çalılık ve orman kenarları' },
  { sp: 'Sorbus torminalis', au: '(L.) Crantz', fam: 'Rosaceae', ord: 'Rosales', cls: 'Magnoliopsida',
    tr: ['Üvez'], habit: 'agac', endemic: false, alt: null, flw: [5, 6], habitat: 'Karışık ormanlar' },
  { sp: 'Sanguisorba minor', au: 'Scop.', fam: 'Rosaceae', ord: 'Rosales', cls: 'Magnoliopsida',
    tr: ['Çayır düğmesi'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 8], habitat: 'Kuru çayırlar' },

  // ── Ranunculaceae ───────────────────────────────────────────────────────
  { sp: 'Anemone blanda', au: 'Schott & Kotschy', fam: 'Ranunculaceae', ord: 'Ranunculales', cls: 'Magnoliopsida',
    tr: ['Yoğurt çiçeği', 'Manisa lalesi'], habit: 'geofit', endemic: false, alt: null, flw: [2, 4],
    habitat: 'Orman altı, taşlık yamaçlar' },
  { sp: 'Nigella damascena', au: 'L.', fam: 'Ranunculaceae', ord: 'Ranunculales', cls: 'Magnoliopsida',
    tr: ['Çörek otu', 'Şeytan tırnağı'], habit: 'tek-yillik-ot', endemic: false, alt: null, flw: [5, 7], habitat: 'Tarla ve yol kenarları' },
  { sp: 'Adonis annua', au: 'L.', fam: 'Ranunculaceae', ord: 'Ranunculales', cls: 'Magnoliopsida',
    tr: ['Kan damlası'], habit: 'tek-yillik-ot', endemic: false, alt: null, flw: [4, 6], habitat: 'Tarlalar' },
  { sp: 'Helleborus orientalis', au: 'Lam.', fam: 'Ranunculaceae', ord: 'Ranunculales', cls: 'Magnoliopsida',
    tr: ['Karacaotu', 'Danaayağı'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [1, 4], habitat: 'Nemli orman altı' },

  // ── Papaveraceae ────────────────────────────────────────────────────────
  { sp: 'Papaver rhoeas', au: 'L.', fam: 'Papaveraceae', ord: 'Ranunculales', cls: 'Magnoliopsida',
    tr: ['Gelincik'], habit: 'tek-yillik-ot', endemic: false, alt: [0, 1800], flw: [4, 7],
    habitat: 'Tarlalar, nadas alanları, yol kenarları' },
  { sp: 'Glaucium flavum', au: 'Crantz', fam: 'Papaveraceae', ord: 'Ranunculales', cls: 'Magnoliopsida',
    tr: ['Boynuzlu gelincik'], habit: 'cok-yillik-ot', endemic: false, alt: [0, 100], flw: [5, 8], habitat: 'Kumsal ve kıyı çakılları' },

  // ── Brassicaceae ────────────────────────────────────────────────────────
  { sp: 'Alyssum murale', au: 'Waldst. & Kit.', fam: 'Brassicaceae', ord: 'Brassicales', cls: 'Magnoliopsida',
    tr: ['Duvar kuduzotu'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 7],
    habitat: 'Serpantin ve kayalık yamaçlar' },
  { sp: 'Aubrieta deltoidea', au: '(L.) DC.', fam: 'Brassicaceae', ord: 'Brassicales', cls: 'Magnoliopsida',
    tr: ['Obrizya'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [3, 5], habitat: 'Kayalıklar' },
  { sp: 'Isatis tinctoria', au: 'L.', fam: 'Brassicaceae', ord: 'Brassicales', cls: 'Magnoliopsida',
    tr: ['Çivit otu'], habit: 'iki-yillik-ot', endemic: false, alt: null, flw: [5, 6], habitat: 'Step ve tarla kenarları' },

  // ── Caryophyllaceae ─────────────────────────────────────────────────────
  { sp: 'Silene vulgaris', au: '(Moench) Garcke', fam: 'Caryophyllaceae', ord: 'Caryophyllales', cls: 'Magnoliopsida',
    tr: ['Gıvışkan otu'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 8], habitat: 'Çayır ve yol kenarları' },
  { sp: 'Dianthus zonatus', au: 'Fenzl', fam: 'Caryophyllaceae', ord: 'Caryophyllales', cls: 'Magnoliopsida',
    tr: ['Karanfil'], habit: 'cok-yillik-ot', endemic: null, alt: null, flw: [6, 8], habitat: 'Kayalık yamaçlar' },

  // ── Boraginaceae ────────────────────────────────────────────────────────
  { sp: 'Anchusa azurea', au: 'Mill.', fam: 'Boraginaceae', ord: 'Boraginales', cls: 'Magnoliopsida',
    tr: ['Sığırdili'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 7], habitat: 'Step, tarla kenarları' },
  { sp: 'Echium vulgare', au: 'L.', fam: 'Boraginaceae', ord: 'Boraginales', cls: 'Magnoliopsida',
    tr: ['Engerek otu'], habit: 'iki-yillik-ot', endemic: false, alt: null, flw: [5, 8], habitat: 'Kuru açık alanlar' },

  // ── Campanulaceae ───────────────────────────────────────────────────────
  { sp: 'Campanula persicifolia', au: 'L.', fam: 'Campanulaceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Çan çiçeği'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [6, 8], habitat: 'Orman açıklıkları' },
  { sp: 'Campanula lyrata', au: 'Lam.', fam: 'Campanulaceae', ord: 'Asterales', cls: 'Magnoliopsida',
    tr: ['Kaya çanı'], habit: 'iki-yillik-ot', endemic: null, alt: null, flw: [5, 7], habitat: 'Kayalık yamaçlar' },

  // ── Apiaceae ────────────────────────────────────────────────────────────
  { sp: 'Ferula communis', au: 'L.', fam: 'Apiaceae', ord: 'Apiales', cls: 'Magnoliopsida',
    tr: ['Çakşır otu'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [4, 6], habitat: 'Akdeniz açık alanları' },
  { sp: 'Eryngium campestre', au: 'L.', fam: 'Apiaceae', ord: 'Apiales', cls: 'Magnoliopsida',
    tr: ['Boğa dikeni'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [6, 9], habitat: 'Kuru step ve meralar' },

  // ── Liliaceae (Liliopsida) ──────────────────────────────────────────────
  { sp: 'Tulipa armena', au: 'Boiss.', fam: 'Liliaceae', ord: 'Liliales', cls: 'Liliopsida',
    tr: ['Dağ lalesi'], habit: 'geofit', endemic: null, alt: [1200, 2600], flw: [4, 6],
    habitat: 'Doğu Anadolu dağ stepleri' },
  { sp: 'Fritillaria imperialis', au: 'L.', fam: 'Liliaceae', ord: 'Liliales', cls: 'Liliopsida',
    tr: ['Ters lale', 'Ağlayan gelin'], habit: 'geofit', endemic: false, alt: [1000, 2500], flw: [4, 5],
    habitat: 'Hakkâri ve çevresi dağ yamaçları' },
  { sp: 'Lilium candidum', au: 'L.', fam: 'Liliaceae', ord: 'Liliales', cls: 'Liliopsida',
    tr: ['Ak zambak'], habit: 'geofit', endemic: false, alt: null, flw: [5, 7], habitat: 'Kayalık yamaçlar' },
  { sp: 'Gagea villosa', au: '(M.Bieb.) Sweet', fam: 'Liliaceae', ord: 'Liliales', cls: 'Liliopsida',
    tr: ['Sarı yıldız'], habit: 'geofit', endemic: false, alt: null, flw: [2, 4], habitat: 'Tarla ve step' },

  // ── Amaryllidaceae ──────────────────────────────────────────────────────
  { sp: 'Galanthus elwesii', au: 'Hook.f.', fam: 'Amaryllidaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Toros kardeleni'], habit: 'geofit', endemic: null, alt: null, flw: [1, 3],
    habitat: 'Orman altı ve çalılıklar' },
  { sp: 'Sternbergia lutea', au: '(L.) Ker Gawl. ex Spreng.', fam: 'Amaryllidaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Karahisar çiğdemi', 'Güz çiğdemi'], habit: 'geofit', endemic: false, alt: null, flw: [9, 11], habitat: 'Kayalık yamaçlar' },
  { sp: 'Narcissus tazetta', au: 'L.', fam: 'Amaryllidaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Nergis'], habit: 'geofit', endemic: false, alt: null, flw: [11, 3], habitat: 'Nemli çayır ve kıyı alanları' },
  { sp: 'Allium schoenoprasum', au: 'L.', fam: 'Amaryllidaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Frenk soğanı'], habit: 'geofit', endemic: false, alt: null, flw: [6, 8], habitat: 'Nemli çayırlar' },

  // ── Iridaceae ───────────────────────────────────────────────────────────
  { sp: 'Crocus ancyrensis', au: '(Herb.) Maw', fam: 'Iridaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Ankara çiğdemi'], habit: 'geofit', endemic: true, alt: [700, 1800], flw: [2, 3],
    habitat: 'İç Anadolu step ve taşlık yamaçları' },
  { sp: 'Iris purpureobractea', au: 'B.Mathew & T.Baytop', fam: 'Iridaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Süsen'], habit: 'geofit', endemic: null, alt: null, flw: [4, 5], habitat: 'Batı Anadolu çam ormanı açıklıkları' },
  { sp: 'Gladiolus italicus', au: 'Mill.', fam: 'Iridaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Kuzgun kılıcı'], habit: 'geofit', endemic: false, alt: null, flw: [4, 6], habitat: 'Ekin tarlaları' },

  // ── Orchidaceae ─────────────────────────────────────────────────────────
  { sp: 'Ophrys apifera', au: 'Huds.', fam: 'Orchidaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Arı orkidesi'], habit: 'geofit', endemic: false, alt: null, flw: [4, 6], habitat: 'Kalker çayır ve makilikler' },
  { sp: 'Orchis anatolica', au: 'Boiss.', fam: 'Orchidaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Anadolu salebi'], habit: 'geofit', endemic: null, alt: null, flw: [3, 5], habitat: 'Makilik ve çam ormanı açıklıkları' },
  { sp: 'Anacamptis pyramidalis', au: '(L.) Rich.', fam: 'Orchidaceae', ord: 'Asparagales', cls: 'Liliopsida',
    tr: ['Piramit orkide'], habit: 'geofit', endemic: false, alt: null, flw: [4, 7], habitat: 'Kalker çayırlar' },

  // ── Poaceae ─────────────────────────────────────────────────────────────
  { sp: 'Stipa holosericea', au: 'Trin.', fam: 'Poaceae', ord: 'Poales', cls: 'Liliopsida',
    tr: ['Sorguç otu'], habit: 'cok-yillik-ot', endemic: null, alt: null, flw: [5, 7], habitat: 'İç Anadolu stepleri' },
  { sp: 'Hordeum bulbosum', au: 'L.', fam: 'Poaceae', ord: 'Poales', cls: 'Liliopsida',
    tr: ['Yumrulu arpa'], habit: 'cok-yillik-ot', endemic: false, alt: null, flw: [5, 7], habitat: 'Kuru çayır ve tarla kenarları' },
];
