import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiAssistantPopup } from '@renderer/components/AiAssistantPopup';
import { ErrorBoundary } from '@renderer/components/ErrorBoundary';
import { Sidebar, type PageKey } from '@renderer/components/Sidebar';
import { TopBar } from '@renderer/components/TopBar';
import { useRecon } from '@renderer/hooks/useRecon';
import { DashboardPage } from '@renderer/pages/DashboardPage';
import { DesignSystemPage } from '@renderer/pages/DesignSystemPage';
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
  const [aiPopupVisible, setAiPopupVisible] = useState<boolean>(false);
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

  const runAiAnalysis = useCallback(
    async (scanId: number): Promise<void> => {
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
    },
    [loadAiSettings],
  );

  useEffect(() => {
    const scanId = recon.latestResult?.id;
    if (!scanId || lastAnalyzedScanId.current === scanId) {
      return;
    }
    lastAnalyzedScanId.current = scanId;
    setAiPopupVisible(true);
    void runAiAnalysis(scanId);
  }, [recon.latestResult, runAiAnalysis]);

  const page = useMemo(() => {
    if (activePage === 'recon') {
      return (
        <ReconPage
          loading={recon.loading}
          error={recon.error}
          latestResult={recon.latestResult}
          onScan={recon.scan}
          onOpenInGraph={() => setActivePage('network')}
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
          onGoRecon={() => setActivePage('recon')}
        />
      );
    }
    if (activePage === 'network') {
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <div className="space-y-4 rounded-[10px] border border-[rgba(225,29,72,0.35)] bg-[rgba(225,29,72,0.08)] p-4 text-sm text-rose-200">
              <p className="font-semibold">Network view crashed.</p>
              <p className="break-words text-rose-300">{error.message}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-[7px] bg-rt-error px-3 py-2 text-white"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setActivePage('dashboard')}
                  className="rounded-[7px] border border-rt-border-strong bg-rt-border px-3 py-2 text-slate-300"
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
            onOpenSettings={() => setActivePage('settings')}
          />
        </ErrorBoundary>
      );
    }
    if (activePage === 'graph') {
      return (
        <GraphIntelPage
          onOpenNodeInNetwork={handleOpenNodeInNetwork}
          onOpenNetwork={() => setActivePage('network')}
        />
      );
    }
    if (activePage === 'settings') {
      return <SettingsPage />;
    }
    if (activePage === 'transfer') {
      return <TransferPage />;
    }
    if (activePage === 'system') {
      return <DesignSystemPage />;
    }

    return (
      <DashboardPage
        totalScans={recon.totalScans}
        latestScans={recon.latestScans}
        todayCount={recon.todayCount}
        onGoRecon={() => setActivePage('recon')}
        onGoHistory={() => setActivePage('history')}
      />
    );
  }, [
    activePage,
    recon,
    networkJumpNodeId,
    handleNetworkJumpHandled,
    handleOpenNodeInNetwork,
  ]);

  return (
    <div className="flex h-full overflow-hidden bg-rt-bg font-sans text-[13px] text-rt-text">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <TopBar sqliteRows={recon.totalScans} />
        <div className="px-8 pb-[90px] pt-[26px]">{page}</div>
      </main>
      {aiPopupVisible ? (
        <AiAssistantPopup
          assistantEnabled={Boolean(aiSettings?.aiAssistantEnabled)}
          hasApiKey={Boolean(aiSettings?.aiApiKey.trim())}
          loading={aiLoading}
          latestTarget={recon.latestResult?.target ?? null}
          analysis={aiAnalysis}
          error={aiError}
          onClose={() => setAiPopupVisible(false)}
          onSend={
            recon.latestResult
              ? () => {
                  const scanId = recon.latestResult?.id;
                  if (scanId) {
                    void runAiAnalysis(scanId);
                  }
                }
              : undefined
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => setAiPopupVisible(true)}
          className="fixed bottom-5 right-[22px] z-40 flex items-center gap-[9px] rounded-[10px] border border-rt-border-strong bg-rt-surface px-3.5 py-[9px] text-[12.5px] font-medium text-rt-text shadow-ai-collapsed"
        >
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border border-[rgba(139,92,246,0.4)] bg-[rgba(139,92,246,0.18)] text-[9px] text-violet-300">
            AI
          </span>
          AI Assistant
        </button>
      )}
    </div>
  );
};
