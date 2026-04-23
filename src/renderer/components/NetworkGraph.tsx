import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphData, GraphNodeType, TargetType } from '@shared/types';

interface GraphNode {
  id: number;
  name: string;
  type: GraphNodeType;
  riskScore?: number;
}

interface GraphLink {
  source: number;
  target: number;
  type: string;
}

interface NetworkGraphProps {
  data: GraphData;
  onScanNode: (payload: { target: string; type: TargetType }) => Promise<void>;
  onDeleteNode: (payload: {
    nodeId: number;
    deleteUniqueNeighbors: boolean;
  }) => Promise<void>;
  onRequestNodeDetails: (nodeId: number) => Promise<void>;
  onFocusNode: (payload: { nodeId: number; hops: 1 | 2 }) => Promise<void>;
  onDedicatedNodeAction: (payload: {
    nodeId: number;
    name: string;
    type: GraphNodeType;
  }) => Promise<void>;
  scanInProgress: boolean;
  deleteInProgress: boolean;
  focusInProgress: boolean;
}

interface SelectedNodeState {
  node: GraphNode;
  x: number;
  y: number;
}

const colorByType: Record<GraphNodeType, string> = {
  domain: '#2563eb',
  ip: '#dc2626',
  email: '#16a34a',
  subdomain: '#3b82f6',
  asn: '#f59e0b',
  org: '#14b8a6',
  nameserver: '#8b5cf6',
  mx: '#a855f7',
  url: '#0ea5e9',
  cidr: '#f97316',
  registrar: '#d946ef',
  phone: '#f43f5e',
  country: '#22c55e',
  city: '#84cc16',
  tech: '#eab308',
  port: '#f97316',
  service: '#06b6d4',
  certificate: '#60a5fa',
  tls_issuer: '#a78bfa',
  spf: '#84cc16',
  dmarc: '#22c55e',
  dkim: '#14b8a6',
  os: '#f43f5e',
};

const sizeByType: Record<GraphNodeType, number> = {
  domain: 3.2,
  ip: 2.6,
  email: 2.5,
  subdomain: 2.8,
  asn: 2.9,
  org: 2.8,
  nameserver: 2.7,
  mx: 2.7,
  url: 2.3,
  cidr: 2.9,
  registrar: 2.5,
  phone: 2.2,
  country: 2.7,
  city: 2.5,
  tech: 2.3,
  port: 2.1,
  service: 2.2,
  certificate: 2.5,
  tls_issuer: 2.4,
  spf: 2.2,
  dmarc: 2.3,
  dkim: 2.2,
  os: 2.2,
};

const isScannableType = (type: GraphNodeType): type is TargetType =>
  type === 'domain' ||
  type === 'ip' ||
  type === 'email' ||
  type === 'url' ||
  type === 'cidr' ||
  type === 'asn' ||
  type === 'nameserver' ||
  type === 'mx';

const dedicatedActionLabelByType: Record<GraphNodeType, string> = {
  domain: 'Scan',
  ip: 'Scan',
  email: 'Scan',
  subdomain: 'Filter subdomain',
  asn: 'Scan ASN',
  org: 'Filter Org',
  nameserver: 'Scan nameserver',
  mx: 'Scan MX host',
  url: 'Scan URL',
  cidr: 'Scan CIDR',
  registrar: 'Filter registrar',
  phone: 'Filter phone',
  country: 'Filter country',
  city: 'Filter city',
  tech: 'Filter tech',
  port: 'Filter port',
  service: 'Filter service',
  certificate: 'Filter certificate',
  tls_issuer: 'Filter issuer',
  spf: 'Filter SPF',
  dmarc: 'Filter DMARC',
  dkim: 'Filter DKIM',
  os: 'Filter OS',
};

export const NetworkGraph = ({
  data,
  onScanNode,
  onDeleteNode,
  onRequestNodeDetails,
  onFocusNode,
  onDedicatedNodeAction,
  scanInProgress,
  deleteInProgress,
  focusInProgress,
}: NetworkGraphProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeState | null>(null);

  const nodes: GraphNode[] = useMemo(
    () =>
      data.nodes.map((node) => {
        const baseNode: GraphNode = {
          id: node.id,
          name: node.value,
          type: node.type,
        };
        if (typeof node.riskScore === 'number') {
          baseNode.riskScore = node.riskScore;
        }
        return baseNode;
      }),
    [data.nodes],
  );

  const links: GraphLink[] = useMemo(
    () =>
      data.edges.map((edge) => ({
        source: edge.source_id,
        target: edge.target_id,
        type: edge.type,
      })),
    [data.edges],
  );

  const getNodeTooltip = useCallback((node: GraphNode): string => node.name, []);
  const nodeTypesPresent = useMemo(
    () => [...new Set(nodes.map((node) => node.type))],
    [nodes],
  );

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);
  const degreeByNodeId = useMemo(() => {
    const map = new Map<number, number>();
    links.forEach((link) => {
      map.set(link.source, (map.get(link.source) ?? 0) + 1);
      map.set(link.target, (map.get(link.target) ?? 0) + 1);
    });
    return map;
  }, [links]);

  const copyNodeValue = async (node: GraphNode): Promise<void> => {
    const value = node.name;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const handleNodeClick = (
    node: GraphNode,
    event: MouseEvent,
  ): void => {
    const container = containerRef.current;
    if (!container) {
      setSelectedNode({ node, x: 16, y: 16 });
      return;
    }

    const rect = container.getBoundingClientRect();
    const x = Math.max(12, Math.min(event.clientX - rect.left + 8, rect.width - 320));
    const y = Math.max(12, Math.min(event.clientY - rect.top + 8, rect.height - 240));
    setSelectedNode({ node, x, y });
    void onRequestNodeDetails(node.id).catch(() => {
      // Keep graph interactive even if detail fetch fails.
    });
  };

  const handleDeleteSelectedNode = async (): Promise<void> => {
    if (!selectedNode) {
      return;
    }

    const uniqueNeighborCount = links.filter((link) => {
      const isConnectedToSelected =
        link.source === selectedNode.node.id || link.target === selectedNode.node.id;
      if (!isConnectedToSelected) {
        return false;
      }
      const neighborId =
        link.source === selectedNode.node.id ? link.target : link.source;
      return (degreeByNodeId.get(neighborId) ?? 0) === 1;
    }).length;

    let deleteUniqueNeighbors = false;
    if (uniqueNeighborCount > 0) {
      const confirmed = window.confirm(
        `${uniqueNeighborCount} noeud(s) uniquement connecte(s) a ce noeud seront aussi supprime(s). Continuer ?`,
      );
      if (!confirmed) {
        return;
      }
      deleteUniqueNeighbors = true;
    }

    await onDeleteNode({
      nodeId: selectedNode.node.id,
      deleteUniqueNeighbors,
    });
    setSelectedNode(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-[480px] overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
    >
      {selectedNode ? (
        <div
          className="absolute z-10 w-72 rounded-md border border-slate-600 bg-slate-950 p-3 text-xs text-slate-200 shadow-xl"
          style={{ left: selectedNode.x, top: selectedNode.y }}
        >
          <p className="truncate font-semibold text-slate-100">{selectedNode.node.name}</p>
          <p className="mt-1 text-slate-400">Type: {selectedNode.node.type}</p>
          <p className="text-slate-400">Id: {selectedNode.node.id}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyNodeValue(selectedNode.node)}
              className="rounded-md bg-slate-700 px-2 py-1 text-white hover:bg-slate-600"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() =>
                isScannableType(selectedNode.node.type)
                  ? void onScanNode({
                      target: selectedNode.node.name,
                      type: selectedNode.node.type,
                    })
                  : void onDedicatedNodeAction({
                      nodeId: selectedNode.node.id,
                      name: selectedNode.node.name,
                      type: selectedNode.node.type,
                    })
              }
              disabled={scanInProgress}
              className="rounded-md bg-sky-700 px-2 py-1 text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {scanInProgress
                ? 'Processing...'
                : dedicatedActionLabelByType[selectedNode.node.type]}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteSelectedNode()}
              disabled={deleteInProgress}
              className="rounded-md bg-rose-700 px-2 py-1 text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {deleteInProgress ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => void onFocusNode({ nodeId: selectedNode.node.id, hops: 1 })}
              disabled={focusInProgress}
              className="rounded-md bg-violet-700 px-2 py-1 text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              Focus 1-hop
            </button>
            <button
              type="button"
              onClick={() => void onFocusNode({ nodeId: selectedNode.node.id, hops: 2 })}
              disabled={focusInProgress}
              className="rounded-md bg-indigo-700 px-2 py-1 text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              Focus 2-hop
            </button>
          </div>
        </div>
      ) : null}
      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-slate-700 bg-slate-950/90 p-2 text-xs text-slate-300">
        <p className="mb-1 font-semibold text-slate-100">Legend</p>
        <div className="flex flex-wrap gap-2">
          {nodeTypesPresent.map((type) => (
            <span key={type} className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colorByType[type] }}
              />
              {type}
            </span>
          ))}
        </div>
      </div>
      <ForceGraph2D
        graphData={graphData}
        backgroundColor="#0f172a"
        nodeLabel={(node) => getNodeTooltip(node as GraphNode)}
        nodeRelSize={4}
        nodeVal={(node) => {
          const graphNode = node as GraphNode;
          const base = sizeByType[graphNode.type];
          const riskBonus = graphNode.riskScore ? Math.min(graphNode.riskScore * 0.2, 0.8) : 0;
          return base + riskBonus;
        }}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.35}
        cooldownTicks={140}
        nodeColor={(node) => colorByType[(node as GraphNode).type]}
        linkColor={() => '#64748b'}
        linkWidth={0.8}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleColor={() => '#94a3b8'}
        onNodeClick={(node, event) => handleNodeClick(node as GraphNode, event)}
        onBackgroundClick={() => setSelectedNode(null)}
      />
    </div>
  );
};
