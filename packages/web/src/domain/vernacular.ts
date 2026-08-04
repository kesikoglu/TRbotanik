import type { TaxonNode } from '@trbotanik/shared';

/**
 * Arayüz diline uygun birincil yerel adı seçer.
 *
 * O dilde ad yoksa diğer dile düşer — hiç ad göstermemek, yanlış dilde bir ad
 * göstermekten daha az bilgilendiricidir (çoğu tür için ya sadece Türkçe ya da
 * sadece İngilizce ad küratörlü/kayıtlı).
 */
export function displayVernacular(
  node: Pick<TaxonNode, 'vernacularTr' | 'vernacularEn'>,
  language: string,
): string | undefined {
  return language.startsWith('en')
    ? node.vernacularEn ?? node.vernacularTr
    : node.vernacularTr ?? node.vernacularEn;
}
