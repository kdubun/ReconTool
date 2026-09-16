import { useEffect, useState } from 'react';
import { ScreenHeader } from '@renderer/components/ScreenHeader';
import { Button, Card, Dot, EmptyState, SearchIcon, TypeBadge } from '@renderer/components/ui';
import { formatClock } from '@renderer/lib/reconView';
import { nodeColor } from '@renderer/theme/nodeColors';
import type { GraphMetrics, ReconResult } from '@shared/types';

interface DashboardPageProps {
  totalScans: number;
  latestScans: ReconResult[];
  todayCount: number;
  onGoRecon: () => void;
  onGoHistory: () => void;
}

const defaultMetrics: GraphMetrics = {
  nodeCount: 0,
  edgeCount: 0,
  avgConfidence: 0,
  avgWeight: 0,
  topNodeTypes: [],
};

export const DashboardPage = ({
  totalScans,
  latestScans,
  todayCount,
  onGoRecon,
  onGoHistory,
}: DashboardPageProps): JSX.Element => {
  const [metrics, setMetrics] = useState<GraphMetrics>(defaultMetrics);
  const last = latestScans[0];
  const ratio =
    metrics.nodeCount > 0 ? (metrics.edgeCount / metrics.nodeCount).toFixed(1) : '0';
  const maxType = metrics.topNodeTypes[0]?.count ?? 1;

  useEffect(() => {
    const loadMetrics = async (): Promise<void> => {
      try {
        const next = await window.api.graph.getMetrics();
        setMetrics(next);
      } catch {
        setMetrics(defaultMetrics);
      }
    };
    void loadMetrics();
  }, [totalScans]);

  return (
    <section>
      <ScreenHeader title="Dashboard" subtitle="Overview of offline recon activity." />

      {totalScans === 0 ? (
        <EmptyState
          title="No scan recorded"
          description="The local database is empty. Run a first reconnaissance to populate the graph and history."
          icon={<SearchIcon size={20} stroke="#334155" />}
          action={<Button onClick={onGoRecon}>Run first recon</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3.5">
            <Card>
              <div className="text-[10.5px] font-medium tracking-[0.07em] text-rt-dim">
                TOTAL SCANS
              </div>
              <div className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] text-rt-strong tabular">
                {totalScans}
              </div>
              {todayCount > 0 ? (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-rt-success">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 14l5-5 5 5" />
                  </svg>
                  +{todayCount} today
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-rt-dim">No scans today</div>
              )}
            </Card>

            <Card>
              <div className="text-[10.5px] font-medium tracking-[0.07em] text-rt-dim">
                LAST TARGET
              </div>
              <div className="mt-2 truncate font-mono text-[19px] font-semibold tracking-[-0.02em] text-rt-strong">
                {last?.target ?? '—'}
              </div>
              {last ? (
                <div className="mt-2 flex items-center gap-1.5">
                  <TypeBadge type={last.type} />
                  <span className="text-[11px] text-rt-dim tabular">{formatClock(last.createdAt)}</span>
                </div>
              ) : null}
            </Card>

            <Card>
              <div className="text-[10.5px] font-medium tracking-[0.07em] text-rt-dim">
                GRAPH NODES / EDGES
              </div>
              <div className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] text-rt-strong tabular">
                {metrics.nodeCount}{' '}
                <span className="font-normal text-rt-border-strong">/</span>{' '}
                <span className="text-rt-accent-light">{metrics.edgeCount}</span>
              </div>
              <div className="mt-2 text-[11px] text-rt-dim">{ratio} edges per node</div>
            </Card>

            <Card>
              <div className="text-[10.5px] font-medium tracking-[0.07em] text-rt-dim">
                AVG CONFIDENCE / WEIGHT
              </div>
              <div className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] text-rt-strong tabular">
                {metrics.avgConfidence.toFixed(2)}{' '}
                <span className="font-normal text-rt-border-strong">/</span>{' '}
                {metrics.avgWeight.toFixed(2)}
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-sm bg-rt-border">
                <div
                  className="h-full bg-rt-accent"
                  style={{ width: `${Math.round(metrics.avgConfidence * 100)}%` }}
                />
              </div>
            </Card>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-3.5">
            <Card className="pb-[18px]">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-[13.5px] font-semibold text-rt-heading">Top node types</div>
                <div className="text-[11px] text-rt-dim">{metrics.nodeCount} nodes</div>
              </div>
              <div className="flex flex-col gap-2">
                {metrics.topNodeTypes.length === 0 ? (
                  <p className="text-[12.5px] text-rt-dim">No graph data yet.</p>
                ) : (
                  metrics.topNodeTypes.slice(0, 6).map((entry) => (
                    <div key={entry.type} className="flex items-center gap-2.5">
                      <Dot type={entry.type} />
                      <span className="w-[74px] font-mono text-xs text-slate-300">{entry.type}</span>
                      <span className="block h-1.5 flex-1 overflow-hidden rounded-[3px] bg-rt-raised">
                        <span
                          className="block h-full rounded-[3px] opacity-85"
                          style={{
                            width: `${Math.round((entry.count / maxType) * 100)}%`,
                            background: nodeColor(entry.type),
                          }}
                        />
                      </span>
                      <span className="w-[26px] text-right text-[11.5px] text-rt-muted tabular">
                        {entry.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="pb-2">
              <div className="mb-1.5 flex items-baseline justify-between">
                <div className="text-[13.5px] font-semibold text-rt-heading">Recent scans</div>
                <button
                  type="button"
                  onClick={onGoHistory}
                  className="bg-transparent p-0 text-[11.5px] text-rt-accent-light"
                >
                  View history →
                </button>
              </div>
              {latestScans.length === 0 ? (
                <p className="py-2 text-[12.5px] text-rt-dim">No historical data yet.</p>
              ) : (
                latestScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-center gap-2.5 border-b border-rt-divider py-2.5 last:border-b-0"
                  >
                    <Dot type={scan.type} size={6} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-rt-text">
                      {scan.target}
                    </span>
                    <TypeBadge type={scan.type} />
                    <span className="w-16 text-right text-[11px] text-rt-dim tabular">
                      {formatClock(scan.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </div>
        </>
      )}
    </section>
  );
};
