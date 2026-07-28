import { useEffect, useState } from 'react';
import { loadDataset, type Dataset } from './dataset';

type State =
  | { status: 'loading' }
  | { status: 'ready'; dataset: Dataset }
  | { status: 'error'; error: Error };

/**
 * Veri paketini bir kez yükler. Faz 1'de tek kaynak vardır; Faz 2'de burada
 * `resolveSource` geri düşüş zinciri devreye girecek ve `degraded` bayrağı eklenecek.
 */
export function useDataset(reloadKey = 0): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    loadDataset(controller.signal)
      .then((dataset) => setState({ status: 'ready', dataset }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  return state;
}
