import { useCallback, useEffect, useState } from 'react';
import { NetworkGraph } from '@renderer/components/NetworkGraph';
import type {
  EnrichmentSettings,
  GraphData,
  GraphMetrics,
  GraphNodeDetails,
  GraphNodeType,
  TargetType,
} from '@shared/types';

const emptyGraph: GraphData = { nodes: [], edges: [] };
const emptyMetrics: GraphMetrics = {
  nodeCount: 0,
  edgeCount: 0,
  avgConfidence: 0,
  avgWeight: 0,
  topNodeTypes: [],
};
const nodeTypeOptions: GraphNodeType[] = [
  'domain',
  'ip',
  'email',
  'subdomain',
  'asn',
  'org',
  'nameserver',
  'mx',
  'url',
  'cidr',
  'registrar',
  'phone',
  'country',
  'city',
  'tech',
  'port',
  'service',
  'certificate',
  'tls_issuer',
  'spf',
  'dmarc',
  'dkim',
  'os',
];

interface NetworkPageProps {
  deepLinkNodeId?: number | null;
  onDeepLinkHandled?: () => void;
}

export const NetworkPage = ({
  deepLinkNodeId = null,
  onDeepLinkHandled,
}: NetworkPageProps): JSX.Element => {
  const [graph, setGraph] = useState<GraphData>(emptyGraph);
  const [metrics, setMetrics] = useState<GraphMetrics>(emptyMetrics);
  const [nodeDetails, setNodeDetails] = useState<GraphNodeDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanInProgress, setScanInProgress] = useState<boolean>(false);
  const [deleteInProgress, setDeleteInProgress] = useState<boolean>(false);
  const [focusInProgress, setFocusInProgress] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<GraphNodeType[]>([]);
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'passive' | 'live' | 'manual'>(
    'all',
  );
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [filtersVisible, setFiltersVisible] = useState<boolean>(false);
  const [enrichmentSettings, setEnrichmentSettings] = useState<EnrichmentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadGraph = useCallback(async (options?: { preserveViewport?: boolean }): Promise<void> => {
    const viewport = options?.preserveViewport
      ? { x: window.scrollX, y: window.scrollY }
      : null;
    setLoading(true);
    setError(null);
    try {
      const data = await window.api.graph.getFiltered({
        query,
        nodeTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
        minConfidence: minConfidence > 0 ? minConfidence : undefined,
        source: sourceFilter,
      });
      setGraph(data);
      const nextMetrics = await window.api.graph.getMetrics();
      setMetrics(nextMetrics);
      setFocusMode(false);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Unable to load graph';
      setError(message);
    } finally {
      setLoading(false);
      if (viewport) {
        window.requestAnimationFrame(() => {
          window.scrollTo(viewport.x, viewport.y);
        });
      }
    }
  }, [minConfidence, query, selectedTypes, sourceFilter]);

  const handleScanNode = useCallback(
    async (payload: { target: string; type: TargetType }): Promise<void> => {
      setScanInProgress(true);
      setError(null);
      setNotice(null);
      try {
        await window.api.recon.scan(payload);
        await loadGraph({ preserveViewport: true });
        setNotice(`Scan finished for ${payload.target}`);
      } catch (scanError) {
        const message =
          scanError instanceof Error ? scanError.message : 'Unable to scan node';
        setError(message);
      } finally {
        setScanInProgress(false);
      }
    },
    [loadGraph],
  );

  const handleDeleteNode = useCallback(
    async (payload: {
      nodeId: number;
      deleteUniqueNeighbors: boolean;
    }): Promise<void> => {
      setDeleteInProgress(true);
      setError(null);
      try {
        const response = await window.api.graph.deleteNode(payload);
        if (response.deletedNodeIds.length === 0) {
          setNotice('Node already gone, graph re-synced.');
        } else {
          setNotice(`Deleted ${response.deletedNodeIds.length} node(s).`);
        }
        await loadGraph({ preserveViewport: true });
      } catch (deleteError) {
        const message =
          deleteError instanceof Error ? deleteError.message : 'Unable to delete node';
        setError(message);
      } finally {
        setDeleteInProgress(false);
      }
    },
    [loadGraph],
  );

  const handleRequestNodeDetails = useCallback(async (nodeId: number): Promise<void> => {
    try {
      const details = await window.api.graph.getNodeDetails({ nodeId });
      setNodeDetails(details);
    } catch {
      setNodeDetails(null);
    }
  }, []);

  const handleFocusNode = useCallback(
    async (payload: { nodeId: number; hops: 1 | 2 }): Promise<void> => {
      setFocusInProgress(true);
      setError(null);
      try {
        const focused = await window.api.graph.focus(payload);
        setGraph(focused);
        setFocusMode(true);
      } catch (focusError) {
        const message =
          focusError instanceof Error ? focusError.message : 'Unable to focus graph';
        setError(message);
      } finally {
        setFocusInProgress(false);
      }
    },
    [],
  );

  const focusAndFilterByNodeType = useCallback(
    async (payload: { nodeId: number; name: string; type: GraphNodeType }): Promise<void> => {
      setSelectedTypes([payload.type]);
      setQuery(payload.name);
      setMinConfidence(0);
      setSourceFilter('all');
      setNodeDetails(null);
      await handleFocusNode({ nodeId: payload.nodeId, hops: 1 });
      await handleRequestNodeDetails(payload.nodeId);
    },
    [handleFocusNode, handleRequestNodeDetails],
  );

  const handleDedicatedNodeAction = useCallback(
    async (payload: { nodeId: number; name: string; type: GraphNodeType }): Promise<void> => {
      setError(null);
      switch (payload.type) {
        case 'url': {
          const destination = payload.name.startsWith('http')
            ? payload.name
            : `https://${payload.name}`;
          window.open(destination, '_blank', 'noopener,noreferrer');
          setNotice(`Opened URL for ${payload.name}`);
          return;
        }
        case 'asn':
        case 'org':
        case 'cidr':
        case 'registrar':
        case 'phone':
        case 'country':
        case 'city':
        case 'tech':
        case 'port':
        case 'service':
        case 'certificate':
        case 'tls_issuer':
        case 'spf':
        case 'dmarc':
        case 'dkim':
        case 'os':
          await focusAndFilterByNodeType(payload);
          setNotice(`Applied graph focus for ${payload.type}: ${payload.name}`);
          return;
        default:
          await focusAndFilterByNodeType(payload);
      }
    },
    [focusAndFilterByNodeType],
  );

  const resetAllFilters = useCallback((): void => {
    setQuery('');
    setSelectedTypes([]);
    setMinConfidence(0);
    setSourceFilter('all');
  }, []);

  const loadEnrichmentSettings = useCallback(async (): Promise<void> => {
    try {
      const settings = await window.api.settings.getEnrichment();
      setEnrichmentSettings(settings);
    } catch {
      setEnrichmentSettings(null);
    }
  }, []);

  const toggleLiveEnrichment = useCallback(async (): Promise<void> => {
    if (!enrichmentSettings) {
      return;
    }
    try {
      const next = await window.api.settings.setEnrichment({
        liveEnrichmentEnabled: !enrichmentSettings.liveEnrichmentEnabled,
      });
      setEnrichmentSettings(next);
    } catch (settingsError) {
      const message =
        settingsError instanceof Error ? settingsError.message : 'Unable to update settings';
      setError(message);
    }
  }, [enrichmentSettings]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    void loadEnrichmentSettings();
  }, [loadEnrichmentSettings]);

  useEffect(() => {
    if (!deepLinkNodeId || deepLinkNodeId <= 0) {
      return;
    }

    const openDeepLinkedNode = async (): Promise<void> => {
      setError(null);
      setNotice(null);
      try {
        await handleFocusNode({ nodeId: deepLinkNodeId, hops: 1 });
        await handleRequestNodeDetails(deepLinkNodeId);
        setNotice(`Focused node #${deepLinkNodeId} from Graph Intel.`);
      } catch (focusError) {
        const message =
          focusError instanceof Error
            ? focusError.message
            : 'Unable to open node from Graph Intel';
        setError(message);
      } finally {
        onDeepLinkHandled?.();
      }
    };

    void openDeepLinkedNode();
  }, [deepLinkNodeId, handleFocusNode, handleRequestNodeDetails, onDeepLinkHandled]);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-slate-100">Network</h2>
        <p className="text-sm text-slate-400">Relationship graph between scanned targets.</p>
      </header>

      <section className="grid gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3 md:grid-cols-4">
        <article>
          <p className="text-xs uppercase text-slate-500">Nodes</p>
          <p className="text-2xl font-semibold text-slate-100">{metrics.nodeCount}</p>
        </article>
        <article>
          <p className="text-xs uppercase text-slate-500">Edges</p>
          <p className="text-2xl font-semibold text-slate-100">{metrics.edgeCount}</p>
        </article>
        <article>
          <p className="text-xs uppercase text-slate-500">Avg confidence</p>
          <p className="text-2xl font-semibold text-slate-100">
            {metrics.avgConfidence.toFixed(2)}
          </p>
        </article>
        <article>
          <p className="text-xs uppercase text-slate-500">Avg weight</p>
          <p className="text-2xl font-semibold text-slate-100">{metrics.avgWeight.toFixed(2)}</p>
        </article>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-300">Filters</p>
          <button
            type="button"
            onClick={() => setFiltersVisible((current) => !current)}
            className="rounded-md bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
          >
            {filtersVisible ? 'Hide filters' : 'Show filters'}
          </button>
        </div>
        {filtersVisible ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search node value..."
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              />
              <select
                value={sourceFilter}
                onChange={(event) =>
                  setSourceFilter(event.target.value as 'all' | 'passive' | 'live' | 'manual')
                }
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">Source: all</option>
                <option value="passive">Source: passive</option>
                <option value="live">Source: live</option>
                <option value="manual">Source: manual</option>
              </select>
              <label className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                Min confidence
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minConfidence}
                  onChange={(event) => setMinConfidence(Number(event.target.value))}
                />
                <span>{minConfidence.toFixed(2)}</span>
              </label>
              <button
                type="button"
                onClick={() => void loadGraph({ preserveViewport: true })}
                className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-600"
              >
                Apply filters
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {nodeTypeOptions.map((type) => {
                const selected = selectedTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setSelectedTypes((current) =>
                        current.includes(type)
                          ? current.filter((entry) => entry !== type)
                          : [...current, type],
                      )
                    }
                    className={`rounded-md px-2 py-1 text-xs ${
                      selected
                        ? 'bg-sky-700 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadGraph({ preserveViewport: true })}
            className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
          >
            Refresh graph
          </button>
          <button
            type="button"
            onClick={() => {
              resetAllFilters();
              void loadGraph({ preserveViewport: true });
            }}
            className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
          >
            Reset filters
          </button>
          {focusMode ? (
            <button
              type="button"
              onClick={() => {
                resetAllFilters();
                void loadGraph({ preserveViewport: true });
              }}
              className="rounded-md bg-violet-700 px-3 py-2 text-sm text-white hover:bg-violet-600"
            >
              Exit focus
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void toggleLiveEnrichment()}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-600"
          >
            Live enrichment: {enrichmentSettings?.liveEnrichmentEnabled ? 'on' : 'off'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-md border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
          Refreshing graph...
        </div>
      ) : null}

      <NetworkGraph
        data={graph}
        onScanNode={handleScanNode}
        onDeleteNode={handleDeleteNode}
        onRequestNodeDetails={handleRequestNodeDetails}
        onFocusNode={handleFocusNode}
        onDedicatedNodeAction={handleDedicatedNodeAction}
        scanInProgress={scanInProgress}
        deleteInProgress={deleteInProgress}
        focusInProgress={focusInProgress}
      />

      {nodeDetails ? (
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h3 className="text-lg font-semibold text-slate-100">Node details</h3>
          <p className="mt-1 text-sm text-slate-300">
            {nodeDetails.node.value} ({nodeDetails.node.type})
          </p>
          <p className="text-xs text-slate-500">
            Neighbors: {nodeDetails.neighbors.length} | Relations: {nodeDetails.edges.length}
          </p>
          <ul className="mt-3 space-y-2">
            {nodeDetails.edges.slice(0, 6).map((edge) => (
              <li key={edge.id} className="rounded bg-slate-950 px-3 py-2 text-xs text-slate-300">
                {edge.type} | confidence {edge.confidence?.toFixed(2) ?? 'n/a'} | weight{' '}
                {edge.weight ?? 1}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
};
