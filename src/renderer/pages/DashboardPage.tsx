import { useEffect, useState } from 'react';
import type { GraphMetrics, ReconResult } from '@shared/types';

interface DashboardPageProps {
  totalScans: number;
  latestScans: ReconResult[];
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
}: DashboardPageProps): JSX.Element => {
  const [metrics, setMetrics] = useState<GraphMetrics>(defaultMetrics);

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
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-100">Dashboard</h2>
        <p className="text-sm text-slate-400">Overview of offline recon activity.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Total scans</p>
          <p className="mt-2 text-3xl font-bold text-sky-400">{totalScans}</p>
        </article>
        <article className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Last target</p>
          <p className="mt-2 truncate text-lg text-slate-100">
            {latestScans[0]?.target ?? 'No scans yet'}
          </p>
        </article>
        <article className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Graph nodes / edges</p>
          <p className="mt-2 text-lg text-slate-100">
            {metrics.nodeCount} / {metrics.edgeCount}
          </p>
        </article>
        <article className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Avg confidence / weight</p>
          <p className="mt-2 text-lg text-slate-100">
            {metrics.avgConfidence.toFixed(2)} / {metrics.avgWeight.toFixed(2)}
          </p>
        </article>
      </div>

      <section className="rounded-lg border border-slate-700 bg-slate-900 p-5">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">Top node types</h3>
        <ul className="mb-4 space-y-2">
          {metrics.topNodeTypes.length === 0 ? (
            <li className="text-sm text-slate-400">No graph data yet.</li>
          ) : (
            metrics.topNodeTypes.map((entry) => (
              <li
                key={entry.type}
                className="flex items-center justify-between rounded bg-slate-950 px-3 py-2 text-sm"
              >
                <span className="text-slate-200">{entry.type}</span>
                <span className="text-slate-400">{entry.count}</span>
              </li>
            ))
          )}
        </ul>
        <h3 className="mb-4 text-lg font-semibold text-slate-100">Recent results</h3>
        <ul className="space-y-2">
          {latestScans.length === 0 ? (
            <li className="text-sm text-slate-400">No historical data yet.</li>
          ) : (
            latestScans.map((scan) => (
              <li
                key={scan.id}
                className="flex items-center justify-between rounded bg-slate-950 px-3 py-2 text-sm"
              >
                <span className="text-slate-200">{scan.target}</span>
                <span className="uppercase text-slate-400">{scan.type}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </section>
  );
};
