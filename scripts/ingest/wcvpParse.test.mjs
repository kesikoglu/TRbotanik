import { describe, expect, it } from 'vitest';
import { buildWcvpIndex, mapLifeformToHabit, parseWcvpCsv } from './wcvpParse.mjs';

describe('WCVP CSV ayrıştırma', () => {
  it('pipe ile ayrılmış satırları, iç içe çift tırnaklı JSON dahil doğru ayrıştırır', () => {
    const header = 'taxonid|scientfiicname|namepublishedin|taxonrank|taxonomicstatus|dynamicproperties';
    const row =
      '2462229|Veronica spicata|Sp. Pl.: 10 (1753)|Species|Accepted|' +
      '"{""powoid"":""812676-1"",""lifeform"":""perennial""}"';
    const rows = parseWcvpCsv(`${header}\n${row}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].scientfiicname).toBe('Veronica spicata');
    expect(rows[0].namepublishedin).toBe('Sp. Pl.: 10 (1753)');
    expect(JSON.parse(rows[0].dynamicproperties)).toEqual({
      powoid: '812676-1',
      lifeform: 'perennial',
    });
  });

  it('sütun sayısı uyuşmayan bozuk satırları atlar', () => {
    const header = 'a|b|c';
    const rows = parseWcvpCsv(`${header}\nx|y`);
    expect(rows).toHaveLength(0);
  });

  it('boş girdi için boş dizi döner', () => {
    expect(parseWcvpCsv('')).toEqual([]);
  });
});

describe('WCVP lifeform -> Habit eşlemesi', () => {
  it('basit tek kelimelik formları eşler', () => {
    expect(mapLifeformToHabit('perennial')).toBe('cok-yillik-ot');
    expect(mapLifeformToHabit('annual')).toBe('tek-yillik-ot');
    expect(mapLifeformToHabit('biennial')).toBe('iki-yillik-ot');
    expect(mapLifeformToHabit('tree')).toBe('agac');
    expect(mapLifeformToHabit('shrub')).toBe('cali');
    expect(mapLifeformToHabit('subshrub')).toBe('calimsi');
    expect(mapLifeformToHabit('climber')).toBe('tirmanici');
    expect(mapLifeformToHabit('succulent')).toBe('sukkulent');
  });

  it("'subshrub' içindeki 'shrub' alt dizesiyle karışmaz", () => {
    expect(mapLifeformToHabit('subshrub')).toBe('calimsi');
    expect(mapLifeformToHabit('hydrosubshrub')).toBe('calimsi');
  });

  it('bileşik ifadelerde en soldaki anahtar kelime kazanır', () => {
    expect(mapLifeformToHabit('perennial or rhizomatous geophyte')).toBe('geofit');
    expect(mapLifeformToHabit('perennial or subshrub')).toBe('calimsi');
    expect(mapLifeformToHabit('shrub or tree')).toBe('cali');
    expect(mapLifeformToHabit('holoparasitic annual')).toBe('parazit');
    expect(mapLifeformToHabit('climbing tuberous geophyte')).toBe('tirmanici');
  });

  it('eşlenemeyen veya boş değerler için null döner', () => {
    expect(mapLifeformToHabit('')).toBeNull();
    expect(mapLifeformToHabit(null)).toBeNull();
    expect(mapLifeformToHabit('helophyte')).toBeNull();
    expect(mapLifeformToHabit('lithophyte')).toBeNull();
  });
});

describe('buildWcvpIndex', () => {
  const header =
    'scientfiicname|taxonrank|taxonomicstatus|namepublishedin|dynamicproperties';

  function row({ name, rank = 'Species', status = 'Accepted', publishedIn = '', lifeform = 'perennial' }) {
    const dp = JSON.stringify({ lifeform }).replace(/"/g, '""');
    return `${name}|${rank}|${status}|${publishedIn}|"${dp}"`;
  }

  it('yalnızca kabul edilmiş tür/alttür seviyesindeki taksonları indeksler', () => {
    const rows = parseWcvpCsv(
      [
        header,
        row({ name: 'Salvia aethiopis' }),
        row({ name: 'Salvia synonymica', status: 'Synonym' }),
        row({ name: 'Salvia', rank: 'Genus' }),
      ].join('\n'),
    );
    const index = buildWcvpIndex(rows);
    expect(index.has('Salvia aethiopis')).toBe(true);
    expect(index.has('Salvia synonymica')).toBe(false);
    expect(index.has('Salvia')).toBe(false);
  });

  it('habit ve publishedIn alanlarını doğru çıkarır', () => {
    const rows = parseWcvpCsv(
      [header, row({ name: 'Medicago rigidula', publishedIn: 'Sp. Pl.: 10 (1753)', lifeform: 'annual' })].join(
        '\n',
      ),
    );
    const index = buildWcvpIndex(rows);
    expect(index.get('Medicago rigidula')).toEqual({
      habit: 'tek-yillik-ot',
      publishedIn: 'Sp. Pl.: 10 (1753)',
    });
  });

  it('yayın bilgisi boşsa null döner', () => {
    const rows = parseWcvpCsv([header, row({ name: 'X y', publishedIn: '' })].join('\n'));
    const index = buildWcvpIndex(rows);
    expect(index.get('X y').publishedIn).toBeNull();
  });
});
