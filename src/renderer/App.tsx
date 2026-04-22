import { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from '@renderer/components/ErrorBoundary';
import { Sidebar, type PageKey } from '@renderer/components/Sidebar';
import { useRecon } from '@renderer/hooks/useRecon';
import { DashboardPage } from '@renderer/pages/DashboardPage';
import { GraphIntelPage } from '@renderer/pages/GraphIntelPage';
import { HistoryPage } from '@renderer/pages/HistoryPage';
import { NetworkPage } from '@renderer/pages/NetworkPage';
import { ReconPage } from '@renderer/pages/ReconPage';
import { SettingsPage } from '@renderer/pages/SettingsPage';

export const App = (): JSX.Element => {
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [networkJumpNodeId, setNetworkJumpNodeId] = useState<number | null>(null);
  const recon = useRecon();

  const handleOpenNodeInNetwork = useCallback((nodeId: number): void => {
    setNetworkJumpNodeId(nodeId);
    setActivePage('network');
  }, []);

  const handleNetworkJumpHandled = useCallback((): void => {
    setNetworkJumpNodeId(null);
  }, []);

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
    </div>
  );
};
