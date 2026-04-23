import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiAssistantPopup } from '@renderer/components/AiAssistantPopup';
import { ErrorBoundary } from '@renderer/components/ErrorBoundary';
import { Sidebar, type PageKey } from '@renderer/components/Sidebar';
import { useRecon } from '@renderer/hooks/useRecon';
import { DashboardPage } from '@renderer/pages/DashboardPage';
import { GraphIntelPage } from '@renderer/pages/GraphIntelPage';
import { HistoryPage } from '@renderer/pages/HistoryPage';
import { NetworkPage } from '@renderer/pages/NetworkPage';
import { ReconPage } from '@renderer/pages/ReconPage';
import { SettingsPage } from '@renderer/pages/SettingsPage';
import { TransferPage } from '@renderer/pages/TransferPage';
import type { AiScanAnalysis, EnrichmentSettings } from '@shared/types';

export const App = (): JSX.Element => {
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [networkJumpNodeId, setNetworkJumpNodeId] = useState<number | null>(null);
  const [aiSettings, setAiSettings] = useState<EnrichmentSettings | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiScanAnalysis | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiPopupVisible, setAiPopupVisible] = useState<boolean>(true);
  const lastAnalyzedScanId = useRef<number | null>(null);
  const recon = useRecon();

  const handleOpenNodeInNetwork = useCallback((nodeId: number): void => {
    setNetworkJumpNodeId(nodeId);
    setActivePage('network');
  }, []);

  const handleNetworkJumpHandled = useCallback((): void => {
    setNetworkJumpNodeId(null);
  }, []);

  const loadAiSettings = useCallback(async (): Promise<EnrichmentSettings | null> => {
    try {
      const next = await window.api.settings.getEnrichment();
      setAiSettings(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void loadAiSettings();
  }, [loadAiSettings, activePage]);

  useEffect(() => {
    const scanId = recon.latestResult?.id;
    if (!scanId || lastAnalyzedScanId.current === scanId) {
      return;
    }
    lastAnalyzedScanId.current = scanId;
    setAiPopupVisible(true);

    const runAnalysis = async (): Promise<void> => {
      setAiLoading(true);
      setAiError(null);
      const settings = await loadAiSettings();
      if (!settings?.aiAssistantEnabled) {
        setAiLoading(false);
        return;
      }
      if (!settings.aiApiKey.trim()) {
        setAiError('AI assistant active but API key is missing in settings.');
        setAiLoading(false);
        return;
      }
      try {
        const analysis = await window.api.ai.analyzeScan({ scanId });
        setAiAnalysis(analysis);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to generate AI analysis.';
        setAiError(message);
      } finally {
        setAiLoading(false);
      }
    };

    void runAnalysis();
  }, [recon.latestResult, loadAiSettings]);

  const page = useMemo(() => {
    if (activePage === 'recon') {
      return (
        <ReconPage
          loading={recon.loading}
          error={recon.error}
          latestResult={recon.latestResult}
          onScan={recon.scan}
        />
      );
    }
    if (activePage === 'history') {
      return (
        <HistoryPage
          history={recon.history}
          loading={recon.loading}
          onRefresh={recon.refreshHistory}
          onDelete={recon.deleteScan}
          onClear={recon.clearScans}
        />
      );
    }
    if (activePage === 'network') {
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <div className="space-y-4 rounded-md border border-rose-700 bg-rose-950 p-4 text-sm text-rose-200">
              <p className="font-semibold">Network view crashed.</p>
              <p className="break-words text-rose-300">{error.message}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md bg-rose-700 px-3 py-2 text-white hover:bg-rose-600"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setActivePage('dashboard')}
                  className="rounded-md bg-slate-700 px-3 py-2 text-white hover:bg-slate-600"
                >
                  Back to dashboard
                </button>
              </div>
            </div>
          )}
        >
          <NetworkPage
            deepLinkNodeId={networkJumpNodeId}
            onDeepLinkHandled={handleNetworkJumpHandled}
          />
        </ErrorBoundary>
      );
    }
    if (activePage === 'graph') {
      return <GraphIntelPage onOpenNodeInNetwork={handleOpenNodeInNetwork} />;
    }
    if (activePage === 'settings') {
      return <SettingsPage />;
    }
    if (activePage === 'transfer') {
      return <TransferPage />;
    }

    return (
      <DashboardPage totalScans={recon.totalScans} latestScans={recon.latestScans} />
    );
  }, [
    activePage,
    recon,
    networkJumpNodeId,
    handleNetworkJumpHandled,
    handleOpenNodeInNetwork,
  ]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 overflow-auto p-6">{page}</main>
      {aiPopupVisible ? (
        <AiAssistantPopup
          assistantEnabled={Boolean(aiSettings?.aiAssistantEnabled)}
          hasApiKey={Boolean(aiSettings?.aiApiKey.trim())}
          loading={aiLoading}
          latestTarget={recon.latestResult?.target ?? null}
          analysis={aiAnalysis}
          error={aiError}
          onClose={() => setAiPopupVisible(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAiPopupVisible(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs text-slate-100 shadow-xl hover:bg-slate-900"
        >
          AI Assistant
        </button>
      )}
    </div>
  );
};
