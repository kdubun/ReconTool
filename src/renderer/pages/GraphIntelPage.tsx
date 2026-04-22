import { useEffect, useMemo, useState } from 'react';
import type { GraphData, GraphMetrics, Relation } from '@shared/types';

const emptyMetrics: GraphMetrics = {
  nodeCount: 0,
  edgeCount: 0,
  avgConfidence: 0,
  avgWeight: 0,
  topNodeTypes: [],
};

const sortByConfidence = (relations: Relation[]): Relation[] =>
  [...relations].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

const sortByWeight = (relations: Relation[]): Relation[] =>
  [...relations].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));

interface GraphIntelPageProps {
  onOpenNodeInNetwork: (nodeId: number) => void;
}

export const GraphIntelPage = ({ onOpenNodeInNetwork }: GraphIntelPageProps): JSX.Element => {
  const [metrics, setMetrics] = useState<GraphMetrics>(emptyMetrics);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const [nextMetrics, nextGraph] = await Promise.all([
          window.api.graph.getMetrics(),
          window.api.graph.getFiltered({}),
        ]);
        setMetrics(nextMetrics);
        setGraph(nextGraph);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : 'Unable to load graph intelligence';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const topConfidenceEdges = useMemo(() => sortByConfidence(graph.edges).slice(0, 8), [graph.edges]);
  const topWeightEdges = useMemo(() => sortByWeight(graph.edges).slice(0, 8), [graph.edges]);
  const nodeValueById = useMemo(() => {
    const map = new Map<number, string>();
    graph.nodes.forEach((node) => {
      map.set(node.id, node.value);
    });
    return map;
  }, [graph.nodes]);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-100">Graph Intel</h2>
        <p className="text-sm text-slate-400">
          Interprete `confidence` (fiabilite) et `weight` (recurrence) du graphe.
        </p>
      </header>

      <section className="grid gap-4 rounded-lg border border-slate-700 bg-slate-900 p-4 md:grid-cols-4">
        <article>
          <p className="text-xs uppercase text-slate-500">Nodes</p>
          <p className="text-2xl font-semibold text-slate-100">{metrics.nodeCount}</p>
        </article>
        <article>
          <p className="text-xs uppercase text-slate-500">Edges</p>
          <p className="text-2xl font-semibold text-slate-100">{metrics.edgeCount}</p>
        </article>
        <article>
          <p className="text-xs uppercase text-slate-500">Average confidence</p>
          <p className="text-2xl font-semibold text-slate-100">{metrics.avgConfidence.toFixed(2)}</p>
        </article>
        <article>
          <p className="text-xs uppercase text-slate-500">Average weight</p>
          <p className="text-2xl font-semibold text-slate-100">{metrics.avgWeight.toFixed(2)}</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h3 className="text-lg font-semibold text-slate-100">Top confidence relations</h3>
          <p className="text-xs text-slate-400">
            Liens consideres comme les plus fiables par les sources/heuristiques.
          </p>
          <ul className="mt-3 space-y-2">
            {topConfidenceEdges.map((edge) => (
              <li key={edge.id} className="rounded bg-slate-950 px-3 py-2 text-xs text-slate-300">
                <p className="font-medium text-slate-100">
                  {nodeValueById.get(edge.source_id) ?? `#${edge.source_id}`} {'->'}{' '}
                  {nodeValueById.get(edge.target_id) ?? `#${edge.target_id}`}
                </p>
                <p>
                  {edge.type} | confidence {edge.confidence?.toFixed(2) ?? 'n/a'} | weight{' '}
                  {edge.weight ?? 1}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenNodeInNetwork(edge.source_id)}
                    className="rounded bg-sky-700 px-2 py-1 text-[11px] text-white hover:bg-sky-600"
                  >
                    Open source node
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenNodeInNetwork(edge.target_id)}
                    className="rounded bg-indigo-700 px-2 py-1 text-[11px] text-white hover:bg-indigo-600"
                  >
                    Open target node
                  </button>
                </div>
              </li>
            ))}
            {topConfidenceEdges.length === 0 ? (
              <li className="rounded bg-slate-950 px-3 py-2 text-xs text-slate-500">
                No relation yet.
              </li>
            ) : null}
          </ul>
        </article>

        <article className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h3 className="text-lg font-semibold text-slate-100">Top weight relations</h3>
          <p className="text-xs text-slate-400">
            Liens les plus repetes au fil des scans (recurrence operationnelle).
          </p>
          <ul className="mt-3 space-y-2">
            {topWeightEdges.map((edge) => (
              <li key={edge.id} className="rounded bg-slate-950 px-3 py-2 text-xs text-slate-300">
                <p className="font-medium text-slate-100">
                  {nodeValueById.get(edge.source_id) ?? `#${edge.source_id}`} {'->'}{' '}
                  {nodeValueById.get(edge.target_id) ?? `#${edge.target_id}`}
                </p>
                <p>
                  {edge.type} | weight {edge.weight ?? 1} | confidence{' '}
                  {edge.confidence?.toFixed(2) ?? 'n/a'}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenNodeInNetwork(edge.source_id)}
                    className="rounded bg-sky-700 px-2 py-1 text-[11px] text-white hover:bg-sky-600"
                  >
                    Open source node
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenNodeInNetwork(edge.target_id)}
                    className="rounded bg-indigo-700 px-2 py-1 text-[11px] text-white hover:bg-indigo-600"
                  >
                    Open target node
                  </button>
                </div>
              </li>
            ))}
            {topWeightEdges.length === 0 ? (
              <li className="rounded bg-slate-950 px-3 py-2 text-xs text-slate-500">
                No relation yet.
              </li>
            ) : null}
          </ul>
        </article>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h3 className="text-lg font-semibold text-slate-100">How to read these metrics</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          <li>
            <strong>Confidence:</strong> qualite estimee du lien (plus haut = plus fiable).
          </li>
          <li>
            <strong>Weight:</strong> nombre de fois ou le meme lien a ete vu (plus haut = plus
            recurrent).
          </li>
          <li>
            <strong>Top node types:</strong>{' '}
            {metrics.topNodeTypes.map((entry) => `${entry.type} (${entry.count})`).join(', ') ||
              'n/a'}
          </li>
        </ul>
      </section>

      {loading ? (
        <div className="rounded-md border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
          Loading graph intelligence...
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}
    </section>
  );
};
