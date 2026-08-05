/**
 * Telefonun konum servisinden koordinat alır.
 *
 * Arazi kullanımı için tasarlandı: yüksek doğruluk açık, önbelleğe alınmış eski
 * konum kabul edilmez (`maximumAge: 0`) — botanikçi yürüyerek yer değiştirdiği
 * için 5 dakika önceki konum yanlış kayda yol açardı.
 *
 * NOT: `navigator.geolocation` yalnızca güvenli bağlamda (HTTPS veya localhost)
 * çalışır. GitHub Pages HTTPS sunduğu için üretimde sorun yoktur.
 */

export interface Fix {
  lat: number;
  lon: number;
  /** Yatay doğruluk yarıçapı (m) — Darwin Core: coordinateUncertaintyInMeters */
  accuracyM: number | null;
  /** GPS'ten gelen rakım (m). Telefonlarda güvenilmezdir, kullanıcı düzeltebilir. */
  altitudeM: number | null;
}

export type GeolocationErrorCode = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export class GeolocationFailure extends Error {
  constructor(public readonly code: GeolocationErrorCode) {
    super(code);
    this.name = 'GeolocationFailure';
  }
}

/** Tarayıcı hatasını bizim kodlarımıza çevirir. */
export function toFailureCode(error: GeolocationPositionError): GeolocationErrorCode {
  switch (error.code) {
    case 1:
      return 'denied';
    case 3:
      return 'timeout';
    default:
      return 'unavailable';
  }
}

export function isGeolocationAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Güvenli bağlam kontrolü. Konum servisi HTTP üzerinden çalışmaz ve tarayıcı
 * bunu "izin reddedildi" gibi gösterir; kullanıcıya doğru sebebi söyleyebilmek
 * için ayrıca kontrol ediliyor.
 */
export function isSecureContextForGeolocation(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

export async function getCurrentFix({ timeoutMs = 20000 } = {}): Promise<Fix> {
  if (!isGeolocationAvailable()) throw new GeolocationFailure('unsupported');
  if (!isSecureContextForGeolocation()) throw new GeolocationFailure('insecure');

  return new Promise<Fix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const c = position.coords;
        resolve({
          lat: c.latitude,
          lon: c.longitude,
          accuracyM: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null,
          altitudeM: c.altitude != null && Number.isFinite(c.altitude) ? Math.round(c.altitude) : null,
        });
      },
      (error) => reject(new GeolocationFailure(toFailureCode(error))),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        // Önbellekten eski konum ALINMAZ — arazide yer değiştiren kullanıcı için
        // birkaç dakikalık eski bir konum sessizce yanlış kayıt üretirdi.
        maximumAge: 0,
      },
    );
  });
}

/** Koordinatı okunur biçimde gösterir (6 hane ≈ 11 cm çözünürlük, fazlası anlamsız). */
export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}
