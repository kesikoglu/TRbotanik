import type { FeatureCollection } from 'geojson';
import type {
  DataManifest,
  OccurrenceRecord,
  PlantDetail,
  TaxonNode,
  TaxonRank,
} from '@trbotanik/shared';
import manifestRaw from '../../public/data/manifest.json?raw';
import taxonomyRaw from '../../public/data/taxonomy.json?raw';
import occurrencesRaw from '../../public/data/occurrences.json?raw';
import detailsRaw from '../../public/data/details.json?raw';
import davisGridRaw from '../../public/data/geo/davis-grid.geojson?raw';
import turkiyeRaw from '../../public/data/geo/turkiye.geojson?raw';
import type { Dataset } from './dataset';

/**
 * Veri setini derlemeye gömer.
 *
 * Yalnızca `VITE_EMBED_DATA=1` ile yapılan tek dosyalık derlemede kullanılır; normal
 * derlemede koşul statik olarak yanlış olduğu için bu modül tamamen elenir
 * (bkz. dataset.ts). Böylece uygulama, dosya sunucusu olmadan tek bir HTML dosyası
 * olarak da çalışabilir.
 *
 * Dosyalar `?raw` ile metin olarak alınır: JSON olarak içe aktarılsalardı TypeScript
 * her denetimde ~1,3 MB veriyi ayrıştırıp devasa literal tipler çıkarmak zorunda
 * kalırdı.
 */
interface TaxonomyFile {
  nodes: TaxonNode[];
  byRank: Record<TaxonRank, number[]>;
  rootIds: number[];
}

const taxonomy = JSON.parse(taxonomyRaw) as TaxonomyFile;

export const EMBEDDED_DATASET: Dataset = {
  manifest: JSON.parse(manifestRaw) as DataManifest,
  nodes: taxonomy.nodes,
  byRank: taxonomy.byRank,
  rootIds: taxonomy.rootIds,
  occurrences: JSON.parse(occurrencesRaw) as OccurrenceRecord[],
  details: JSON.parse(detailsRaw) as Record<number, PlantDetail>,
  davisGrid: JSON.parse(davisGridRaw) as FeatureCollection,
  turkiye: JSON.parse(turkiyeRaw) as FeatureCollection,
};
