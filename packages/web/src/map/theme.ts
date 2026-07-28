/**
 * Harita renkleri — tek doğruluk kaynağı.
 *
 * Choropleth rampası sıralı, renk körlüğüne dayanıklı ve gri tonlamaya çevrildiğinde de
 * sırasını koruyan bir palettir (viridis türevi); akademik yayında siyah-beyaz basılsa
 * bile büyüklük sırası okunur.
 */
export const CHOROPLETH_RAMP = [
  '#1f4a45',
  '#1b6357',
  '#2b7d5f',
  '#57955f',
  '#8aab58',
  '#c2be51',
  '#e8cb56',
  '#fdd05c',
] as const;

/** Kayıt olmayan kare — rampanın dışında, kasıtlı olarak nötr. */
export const NO_DATA_COLOR = '#26312e';

export const MAP_COLORS = {
  background: '#0b1210',
  land: '#1a241f',
  landOutline: '#3d5a4a',
  gridLine: 'rgba(160, 200, 178, 0.28)',
  gridLineHover: '#6ee7a8',
  gridLineSelected: '#6ee7a8',
  /** Herbaryum / GBIF kaydı */
  pointGbif: '#7dd3fc',
  /** Topluluk katkısı — kasıtlı olarak farklı renk ve sembol (Faz 3) */
  pointCommunity: '#fbbf24',
  cluster: '#3fbf82',
  /** Kenar çubuğundan seçilen tek türün vurgusu — endemizm rozetiyle aynı renk ailesi */
  speciesHighlight: '#f0abfc',
} as const;

/** Türkiye'yi tam kapsayan başlangıç görünümü. */
export const TURKIYE_VIEW_BOUNDS: [[number, number], [number, number]] = [
  [25.4, 35.6],
  [45.2, 42.4],
];
