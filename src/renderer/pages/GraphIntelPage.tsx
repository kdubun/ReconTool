import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from '@renderer/components/ScreenHeader';
import { ArrowRightIcon, Button, Card, Dot, Toast } from '@renderer/components/ui';
import type { GraphData, GraphMetrics, GraphNodeType, Relation, Target } from '@shared/types';

const emptyMetrics: GraphMetrics = {
  nodeCount: 0,
  edgeCount: 0,
  avgConfidence: 0,
  avgWeight: 0,
  topNodeTypes: [],
};

const sortByConfidence = (relations: Relation[]): Relation[] =>
  [...relations].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || (b.weight ?? 1) - (a.weight ?? 1));

const sortByWeight = (relations: Relation[]): Relation[] =>
  [...relations].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1) || (b.confidence ?? 0) - (a.confidence ?? 0));

interface GraphIntelPageProps {
  onOpenNodeInNetwork: (nodeId: number) => void;
  onOpenNetwork: () => void;
}

interface RelationRowProps {
  edge: Relation;
  nodesById: Map<number, Target>;
  dominant: 'confidence' | 'weight';
  onOpen: (nodeId: number) => void;
}

const RelationRow = ({ edge, nodesById, dominant, onOpen }: RelationRowProps): JSX.Element => {
  const source = nodesById.get(edge.source_id);
  const target = nodesById.get(edge.target_id);
  const sourceLabel = source?.value ?? `#${edge.source_id}`;
  const targetLabel = target?.value ?? `#${edge.target_id}`;
  const sourceType = (source?.type ?? 'domain') as GraphNodeType;
  const targetType = (target?.type ?? 'domain') as GraphNodeType;
  const conf = (edge.confidence ?? 0).toFixed(2);
  const weight = edge.weight ?? 1;

  return (
    <button
      type="button"
      onClick={() => onOpen(edge.source_id)}
      className="flex w-full items-center gap-[11px] border-b border-rt-divider px-4 py-2.5 text-left last:border-b-0 hover:bg-[#0f1a2e]"
    >
      <Dot type={sourceType} size={6} />
      <span className="max-w-[150px] truncate font-mono text-xs text-rt-text">{sourceLabel}</span>
      <ArrowRightIcon />
      <Dot type={targetType} size={6} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-rt-text">{targetLabel}</span>
      <span className="font-mono text-[10.5px] text-rt-dim">
        {sourceType}→{targetType}
      </span>
      {dominant === 'confidence' ? (
        <>
          <span className="text-xs font-semibold text-rt-accent-light tabular">{conf}</span>
          <span className="w-[30px] text-right text-[11px] text-rt-faint tabular">w{weight}</span>
        </>
      ) : (
        <>
          <span className="text-xs font-semibold text-rt-heading tabular">w{weight}</span>
          <span className="w-[30px] text-right text-[11px] text-rt-faint tabular">{conf}</span>
        </>
      )}
    </button>
  );
};

export const GraphIntelPage = ({
  onOpenNodeInNetwork,
  onOpenNetwork,
}: GraphIntelPageProps): JSX.Element => {
  const [metrics, setMetrics] = useState<GraphMetrics>(emptyMetrics);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setError(null);
      try {
        const [nextMetrics, nextGraph] = await Promise.all([
          window.api.graph.getMetrics(),
          window.api.graph.getFiltered({}),
        ]);
        setMetrics(nextMetrics);
        setGraph(nextGraph);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load graph intelligence');
      }
    };
    void load();
  }, []);

  const topConfidenceEdges = useMemo(() => sortByConfidence(graph.edges).slice(0, 8), [graph.edges]);
  const topWeightEdges = useMemo(() => sortByWeight(graph.edges).slice(0, 8), [graph.edges]);
  const nodesById = useMemo(() => {
    const map = new Map<number, Target>();
    graph.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [graph.nodes]);
  const ratio = metrics.nodeCount > 0 ? (metrics.edgeCount / metrics.nodeCount).toFixed(1) : '0';
  const above =
    graph.edges.length > 0
      ? Math.round(
          (graph.edges.filter((edge) => (edge.confidence ?? 0) >= 0.75).length / graph.edges.length) *
            100,
        )
      : 0;

  const kpis = [
    { label: 'NODES', value: String(metrics.nodeCount), note: `${metrics.topNodeTypes.length} types` },
    { label: 'EDGES', value: String(metrics.edgeCount), note: `${ratio} per node` },
    { label: 'AVERAGE CONFIDENCE', value: metrics.avgConfidence.toFixed(2), note: `${above}% above 0.75` },
    { label: 'AVERAGE WEIGHT', value: metrics.avgWeight.toFixed(2), note: 'recurrence across scans' },
  ];

  return (
    <section>
      <ScreenHeader
        title="Graph Intel"
        subtitle={
          <>
            Reads <span className="font-mono text-rt-muted">confidence</span> (reliability) and{' '}
            <span className="font-mono text-rt-muted">weight</span> (recurrence) — analytical view, not
            a second graph.
          </>
        }
      />

      {error ? (
        <Toast tone="error" className="mb-3.5">
          {error}
        </Toast>
      ) : null}

      <div className="mb-3.5 grid grid-cols-4 gap-3.5">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="px-4 py-3.5">
            <div className="text-[10.5px] font-medium tracking-[0.07em] text-rt-dim">{kpi.label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-rt-strong tabular">
              {kpi.value}
            </div>
            <div className="mt-1 text-[11px] text-rt-dim">{kpi.note}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="overflow-hidden rounded-[10px] border border-rt-border bg-rt-surface">
          <div className="border-b border-rt-border px-4 py-3.5">
            <div className="text-[13.5px] font-semibold text-rt-heading">Top relations by confidence</div>
            <div className="mt-0.5 text-[11.5px] text-rt-dim">
              Links judged most reliable by source heuristics.
            </div>
          </div>
          {topConfidenceEdges.length === 0 ? (
            <p className="px-4 py-3 text-xs text-rt-faint">No relation yet.</p>
          ) : (
            topConfidenceEdges.map((edge) => (
              <RelationRow
                key={edge.id}
                edge={edge}
                nodesById={nodesById}
                dominant="confidence"
                onOpen={onOpenNodeInNetwork}
              />
            ))
          )}
        </div>
        <div className="overflow-hidden rounded-[10px] border border-rt-border bg-rt-surface">
          <div className="border-b border-rt-border px-4 py-3.5">
            <div className="text-[13.5px] font-semibold text-rt-heading">Top relations by weight</div>
            <div className="mt-0.5 text-[11.5px] text-rt-dim">
              Most repeated links across scans — operational recurrence.
            </div>
          </div>
          {topWeightEdges.length === 0 ? (
            <p className="px-4 py-3 text-xs text-rt-faint">No relation yet.</p>
          ) : (
            topWeightEdges.map((edge) => (
              <RelationRow
                key={edge.id}
                edge={edge}
                nodesById={nodesById}
                dominant="weight"
                onOpen={onOpenNodeInNetwork}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 rounded-[9px] border border-rt-border bg-rt-raised px-4 py-3">
        <span className="text-xs text-rt-muted">
          Select a relation to inspect both endpoints in the force graph.
        </span>
        <div className="flex-1" />
        <Button onClick={onOpenNetwork} className="px-[13px] py-1.5 text-xs">
          Open in Network
        </Button>
      </div>
    </section>
  );
};
