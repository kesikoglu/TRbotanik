import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './tr.json';
import en from './en.json';

export const SUPPORTED_LANGUAGES = ['tr', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'trbotanik.lang';

/**
 * Varsayılan dil her zaman Türkçe'dir; hedef kitle Türkiye'deki akademik personel ve
 * öğrencilerdir. Tarayıcı diline göre otomatik geçiş yapılmaz — yurt dışından açan bir
 * araştırmacının İngilizce görmesi beklenebilir olsa da, kurum bilgisayarlarının çoğu
 * İngilizce yerel ayarla kurulu olduğu için bu, asıl kitleyi yanlış dile düşürürdü.
 * Kullanıcının açık tercihi saklanır ve ona öncelik verilir.
 */
function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'tr' || stored === 'en') return stored;
  } catch {
    // localStorage erişilemiyor olabilir (gizli sekme, katı çerez politikası)
  }
  return 'tr';
}

void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // yoksayılabilir
  }
}

document.documentElement.lang = i18n.language;

export default i18n;
