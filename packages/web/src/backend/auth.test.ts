import { describe, expect, it } from 'vitest';
import { canContribute, canReview, isAdmin, type SessionUser } from './auth';
import { describeError } from './client';
import type { Profile, UserRole, UserStatus } from './types';

/**
 * Yetki kapıları.
 *
 * Bu fonksiyonlar arayüzde hangi düğmelerin görüneceğini belirler. Buradaki bir
 * hata, örneğin bir öğrenciye onaylama düğmesini gösterirdi — sunucu isteği yine
 * reddederdi (asıl koruma RLS'tedir) ama kullanıcıya çalışmayan bir arayüz
 * sunulurdu. Bu yüzden her rol/durum bileşimi tek tek sınanıyor.
 */
function user(role: UserRole, status: UserStatus): SessionUser {
  return {
    id: 'u1',
    email: 'a@uni.edu.tr',
    profile: { id: 'u1', display_name: 'A', role, status } as Profile,
  };
}

const ROLES: UserRole[] = ['admin', 'curator', 'contributor'];
const STATUSES: UserStatus[] = ['pending', 'approved', 'suspended'];

describe('canContribute', () => {
  it('yalnızca onaylanmış hesap veri girebilir — rol fark etmez', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        expect(canContribute(user(role, status))).toBe(status === 'approved');
      }
    }
  });

  it('oturum yokken veya profil okunamamışken false', () => {
    expect(canContribute(null)).toBe(false);
    expect(canContribute({ id: 'u1', email: 'a@b.c', profile: null })).toBe(false);
  });
});

describe('canReview', () => {
  it('yalnızca ONAYLANMIŞ yönetici ve küratör denetleyebilir', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const expected = status === 'approved' && (role === 'admin' || role === 'curator');
        expect(canReview(user(role, status))).toBe(expected);
      }
    }
  });

  it('onaylanmamış yönetici denetleyemez', () => {
    expect(canReview(user('admin', 'pending'))).toBe(false);
    expect(canReview(user('admin', 'suspended'))).toBe(false);
  });

  it('onaylı katkıda bulunan denetleyemez', () => {
    expect(canReview(user('contributor', 'approved'))).toBe(false);
  });

  it('oturum yokken false', () => {
    expect(canReview(null)).toBe(false);
  });
});

describe('isAdmin', () => {
  it('yalnızca onaylanmış yönetici', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        expect(isAdmin(user(role, status))).toBe(status === 'approved' && role === 'admin');
      }
    }
  });

  it('küratör yönetici değildir', () => {
    expect(isAdmin(user('curator', 'approved'))).toBe(false);
  });

  it('oturum yokken false', () => {
    expect(isAdmin(null)).toBe(false);
  });
});

describe('describeError', () => {
  it('RLS reddini onay bekleme açıklamasına çevirir', () => {
    const msg = describeError(new Error('new row violates row-level security policy for table "observations"'));
    expect(msg).toContain('yetkiniz yok');
    expect(msg).toContain('onaylanmamış');
  });

  it('hatalı giriş bilgisini çevirir', () => {
    expect(describeError(new Error('Invalid login credentials'))).toBe('E-posta veya şifre hatalı.');
  });

  it('ağ hatasını çevirir', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toContain('Sunucuya ulaşılamadı');
  });

  it('zaten kayıtlı e-postayı çevirir', () => {
    expect(describeError(new Error('User already registered'))).toContain('zaten bir hesap var');
  });

  it('tanımadığı hatayı GİZLEMEZ, olduğu gibi gösterir', () => {
    // Sessizce yutmak, sorunu teşhis edilemez hâle getirirdi.
    expect(describeError(new Error('duplicate key value violates unique constraint'))).toBe(
      'duplicate key value violates unique constraint',
    );
  });

  it('Error olmayan değeri de metne çevirir', () => {
    expect(describeError('düz metin hata')).toBe('düz metin hata');
  });
});
