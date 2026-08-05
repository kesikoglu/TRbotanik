import type { FeatureCollection } from 'geojson';
import {
  unpackDetails,
  type DataManifest,
  type OccurrenceRecord,
  type PackedDetailsFile,
  type PlantDetail,
  type TaxonNode,
  type TaxonRank,
} from '@trbotanik/shared';

/**
 * Uygulamanın tamamının okuduğu, bir kez yüklenen veri paketi.
 *
 * Faz 1'de tümü statik dosyadan gelir. Faz 2+'da `StaticBundleSource` ile
 * `GbifLiveSource`/`ApiSource` aynı arayüzü sağlayacak ve bileşenler hangi kaynağın
 * kullanıldığını bilmeyecek — bu yüzden yükleme tek bir yerde toplanmıştır.
 */
export interface Dataset {
  manifest: DataManifest;
  nodes: TaxonNode[];
  byRank: Record<TaxonRank, number[]>;
  rootIds: number[];
  occurrences: OccurrenceRecord[];
  details: Record<number, PlantDetail>;
  davisGrid: FeatureCollection;
  turkiye: FeatureCollection;
}

interface TaxonomyFile {
  nodes: TaxonNode[];
  byRank: Record<TaxonRank, number[]>;
  rootIds: number[];
}

const BASE = `${import.meta.env.BASE_URL}data`;

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, { signal });
  if (!response.ok) {
    throw new Error(`${path} yüklenemedi (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  // Tek dosyalık derlemede veri paketin içindedir; hiçbir istek yapılmaz.
  // Normal derlemede bu koşul statik olarak yanlıştır ve modül elenir.
  if (import.meta.env['VITE_EMBED_DATA'] === '1') {
    const { EMBEDDED_DATASET } = await import('./embedded');
    return EMBEDDED_DATASET;
  }

  const [manifest, taxonomy, occurrences, details, davisGrid, turkiye] = await Promise.all([
    fetchJson<DataManifest>('manifest.json', signal),
    fetchJson<TaxonomyFile>('taxonomy.json', signal),
    fetchJson<OccurrenceRecord[]>('occurrences.json', signal),
    fetchJson<PackedDetailsFile | Record<number, PlantDetail>>('details.json', signal),
    fetchJson<FeatureCollection>('geo/davis-grid.geojson', signal),
    fetchJson<FeatureCollection>('geo/turkiye.geojson', signal),
  ]);

  return {
    manifest,
    nodes: taxonomy.nodes,
    byRank: taxonomy.byRank,
    rootIds: taxonomy.rootIds,
    occurrences,
    // Gerçek anlık görüntü kaynak-tekilleştirilmiş biçimde gelir; fixture verisi
    // düz biçimdedir — `unpackDetails` ikisini de kabul eder.
    details: unpackDetails(details),
    davisGrid,
    turkiye,
  };
}
