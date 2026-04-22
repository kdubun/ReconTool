import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReconResult, TargetType } from '@shared/types';

interface UseReconState {
  history: ReconResult[];
  latestResult: ReconResult | null;
  loading: boolean;
  error: string | null;
}

interface ScanPayload {
  target: string;
  type: TargetType;
}

interface UseReconReturn extends UseReconState {
  scan: (payload: ScanPayload) => Promise<void>;
  refreshHistory: () => Promise<void>;
  deleteScan: (id: number) => Promise<void>;
  clearScans: () => Promise<void>;
  totalScans: number;
  latestScans: ReconResult[];
}

export const useRecon = (): UseReconReturn => {
  const [state, setState] = useState<UseReconState>({
    history: [],
    latestResult: null,
    loading: false,
    error: null,
  });

  const refreshHistory = useCallback(async (): Promise<void> => {
    if (!window.api?.recon) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: 'Bridge preload indisponible: redemarre l application.',
      }));
      return;
    }

    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const history = await window.api.recon.getHistory();
      setState((previous) => ({ ...previous, history, loading: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load history';
      setState((previous) => ({ ...previous, loading: false, error: message }));
    }
  }, []);

  const scan = useCallback(
    async (payload: ScanPayload): Promise<void> => {
      if (!window.api?.recon) {
        setState((previous) => ({
          ...previous,
          loading: false,
          error: 'Bridge preload indisponible: redemarre l application.',
        }));
        return;
      }

      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const result = await window.api.recon.scan(payload);
        const updatedHistory = await window.api.recon.getHistory();
        setState((previous) => ({
          ...previous,
          loading: false,
          latestResult: result,
          history: updatedHistory,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scan failed';
        setState((previous) => ({ ...previous, loading: false, error: message }));
      }
    },
    [],
  );

  const deleteScan = useCallback(async (id: number): Promise<void> => {
    if (!window.api?.recon) {
      setState((previous) => ({
        ...previous,
        error: 'Bridge preload indisponible: redemarre l application.',
      }));
      return;
    }

    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      await window.api.recon.delete({ id });
      const updatedHistory = await window.api.recon.getHistory();
      setState((previous) => ({
        ...previous,
        loading: false,
        history: updatedHistory,
        latestResult:
          previous.latestResult?.id === id ? null : previous.latestResult,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      setState((previous) => ({ ...previous, loading: false, error: message }));
    }
  }, []);

  const clearScans = useCallback(async (): Promise<void> => {
    if (!window.api?.recon) {
      setState((previous) => ({
        ...previous,
        error: 'Bridge preload indisponible: redemarre l application.',
      }));
      return;
    }

    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      await window.api.recon.clearHistory();
      setState((previous) => ({
        ...previous,
        loading: false,
        history: [],
        latestResult: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clear failed';
      setState((previous) => ({ ...previous, loading: false, error: message }));
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const totalScans = state.history.length;
  const latestScans = useMemo(() => state.history.slice(0, 5), [state.history]);

  return {
    ...state,
    scan,
    refreshHistory,
    deleteScan,
    clearScans,
    totalScans,
    latestScans,
  };
};
