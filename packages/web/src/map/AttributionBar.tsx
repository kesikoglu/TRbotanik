import { useMemo } from 'react';
import type { DataManifest } from '@trbotanik/shared';
import { resolveBasemap } from './basemaps';

/**
 * Atıf çubuğu isteğe bağlı arayüz değildir.
 *
 * CC-BY-NC gibi atıf zorunlu lisanslı altlık ve veri kullanan bir projede bu bir yasal
 * gerekliliktir; ayrıca GBIF indirmesinin DOI'si akademik atıf için burada gösterilir.
 * Bu yüzden kapatılamaz.
 */
export function AttributionBar({ manifest }: { manifest: DataManifest }) {
  const basemap = useMemo(() => resolveBasemap(), []);

  return (
    <div className="attribution" data-testid="attribution">
      <span dangerouslySetInnerHTML={{ __html: basemap.attributionHtml }} />
      {manifest.gbifDownloadDoi && (
        <>
          {' · '}
          <a href={`https://doi.org/${manifest.gbifDownloadDoi}`} target="_blank" rel="noreferrer">
            GBIF {manifest.gbifDownloadDoi}
          </a>
        </>
      )}
    </div>
  );
}
