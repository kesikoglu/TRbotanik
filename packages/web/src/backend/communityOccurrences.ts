import { isDavisCode, type OccurrenceRecord, type TaxonNode } from '@trbotanik/shared';
import { listApprovedObservations } from './observations';
import type { Observation } from './types';

/**
 * Onaylı topluluk gözlemlerini haritanın anladığı `OccurrenceRecord` biçimine çevirir.
 *
 * KAYNAK AYRIMI KORUNUR: Dönen kayıtlar `source: 'community'` taşır. Harita bunları
 * GBIF/herbaryum kayıtlarından farklı renkte çizer ve lejantta "doğrulanmamış" diye
 * işaretler (bkz. MapCanvas, MAP_COLORS.pointCommunity). Bu ayrım kasıtlıdır:
 * yayınlanmamış arazi verisi, küratörlü referans veriyle aynı görsel ağırlıkta
 * sunulmamalıdır.
 *
 * TAKSON EŞLEŞTİRME: Gözlemin haritada bir yere düşebilmesi için taksonomi ağacında
 * bir düğüme bağlanması gerekir (filtreleme DFS aralıklarıyla çalışır). Önce GBIF
 * anahtarı, sonra ad denenir. Hiçbiri tutmazsa kayıt ATLANIR — ör. "Astragalus sp."
 * gibi teşhis edilmemiş bir girdi ağaçta karşılığı olmadığı için gösterilemez.
 * Bu sessiz bir kayıp değildir: atlanan sayı çağırana bildirilir.
 */

export interface CommunityResult {
  occurrences: OccurrenceRecord[];
  /** Taksonomi ağacında karşılığı bulunamadığı için gösterilemeyen kayıt sayısı. */
  unmatched: number;
}

/** Ada göre eşleştirme için normalleştirme — büyük/küçük ve fazla boşluk farkını siler. */
function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildTaxonIndex(nodes: TaxonNode[]): {
  byGbifKey: Map<number, number>;
  byName: Map<string, number>;
} {
  const byGbifKey = new Map<number, number>();
  const byName = new Map<string, number>();
  for (const node of nodes) {
    if (node.rank !== 'SPECIES') continue;
    if (node.gbifKey != null) byGbifKey.set(node.gbifKey, node.id);
    byName.set(nameKey(node.name), node.id);
  }
  return { byGbifKey, byName };
}

export function toOccurrenceRecords(
  observations: Observation[],
  nodes: TaxonNode[],
  displayNameById: Map<string, { displayName: string; institution?: string }> = new Map(),
): CommunityResult {
  const { byGbifKey, byName } = buildTaxonIndex(nodes);
  const occurrences: OccurrenceRecord[] = [];
  let unmatched = 0;

  for (const obs of observations) {
    const taxonId =
      (obs.gbif_key != null ? byGbifKey.get(obs.gbif_key) : undefined) ??
      byName.get(nameKey(obs.scientific_name));

    if (taxonId === undefined) {
      unmatched++;
      continue;
    }

    const contributor = displayNameById.get(obs.created_by);

    occurrences.push({
      // Ön ek, GBIF kayıt kimlikleriyle çakışmayı imkânsız kılar.
      id: `community-${obs.id}`,
      taxonId,
      lat: obs.lat,
      lon: obs.lon,
      davisSquare: isDavisCode(obs.davis_square) ? obs.davis_square : null,
      coordinateUncertaintyM: obs.coordinate_uncertainty_m ?? 0,
      year: obs.observed_on ? Number(obs.observed_on.slice(0, 4)) : null,
      province: obs.province,
      elevationM: obs.elevation_m,
      basisOfRecord: 'HUMAN_OBSERVATION',
      source: 'community',
      ...(contributor
        ? {
            contributor: {
              displayName: contributor.displayName,
              ...(contributor.institution ? { institution: contributor.institution } : {}),
              // Kurum bilgisi doğrulanmış bir akademik kimlik ANLAMINA GELMEZ;
              // kullanıcının kendi beyanıdır. Bu yüzden false.
              academicVerified: false,
            },
          }
        : {}),
      license: 'CC-BY',
    });
  }

  return { occurrences, unmatched };
}

/** Onaylı topluluk gözlemlerini çeker ve harita kaydına çevirir. */
export async function loadCommunityOccurrences(nodes: TaxonNode[]): Promise<CommunityResult> {
  const observations = await listApprovedObservations();
  return toOccurrenceRecords(observations, nodes);
}
