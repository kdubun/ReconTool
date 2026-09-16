import { useCallback, useEffect, useRef, useState } from 'react';
import { NetworkGraph } from '@renderer/components/NetworkGraph';
import { ScreenHeader } from '@renderer/components/ScreenHeader';
import {
  AlertIcon,
  Button,
  Chip,
  Dot,
  EmptyState,
  Input,
  RefreshIcon,
  SearchIcon,
  Segmented,
  Spinner,
  Toast,
} from '@renderer/components/ui';
import { LEGEND_NODE_TYPES } from '@renderer/theme/nodeColors';
import type { LeavesMode } from '@renderer/lib/radialLayout';
import type {
  EnrichmentSettings,
  GraphData,
  GraphFilters,
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
const scannableTargetTypes = new Set<GraphNodeType>([
  'domain',
  'ip',
  'email',
  'url',
  'cidr',
  'asn',
  'nameserver',
  'mx',
]);

const toScanPayload = (
  node: { value: string; type: GraphNodeType },
): { target: string; type: TargetType } | null => {
  if (node.type === 'subdomain') {
    return { target: node.value, type: 'domain' };
  }
  if (scannableTargetTypes.has(node.type)) {
    return { target: node.value, type: node.type as TargetType };
  }
  return null;
};

const scanKey = (payload: { target: string; type: TargetType }): string =>
  `${payload.type}:${payload.target.trim().toLowerCase()}`;

interface NetworkPageProps {
  deepLinkNodeId?: number | null;
  onDeepLinkHandled?: () => void;
  onOpenSettings?: () => void;
}

export const NetworkPage = ({
  deepLinkNodeId = null,
  onDeepLinkHandled,
  onOpenSettings,
}: NetworkPageProps): JSX.Element => {
  const [graph, setGraph] = useState<GraphData>(emptyGraph);
  const [metrics, setMetrics] = useState<GraphMetrics>(emptyMetrics);
  const [nodeDetails, setNodeDetails] = useState<GraphNodeDetails | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanInProgress, setScanInProgress] = useState<boolean>(false);
  const [deleteInProgress, setDeleteInProgress] = useState<boolean>(false);
  const [focusInProgress, setFocusInProgress] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [hiddenTypes, setHiddenTypes] = useState<Set<GraphNodeType>>(new Set());
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'passive' | 'live' | 'manual'>(
    'all',
  );
  const [isolated, setIsolated] = useState<boolean>(false);
  const [visualFocus, setVisualFocus] = useState<boolean>(false);
  const [filtersVisible, setFiltersVisible] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<'Rings' | 'Force'>('Rings');
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [leavesMode, setLeavesMode] = useState<LeavesMode>('Collapsed');
  const [enrichmentSettings, setEnrichmentSettings] = useState<EnrichmentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoScanInProgress, setAutoScanInProgress] = useState<boolean>(false);
  const [unscannedOnly, setUnscannedOnly] = useState<boolean>(true);
  const autoScanCancelRef = useRef<boolean>(false);

  const loadGraph = useCallback(async (options?: { preserveViewport?: boolean }): Promise<void> => {
    const viewport = options?.preserveViewport
      ? { x: window.scrollX, y: window.scrollY }
      : null;
    setLoading(true);
    setError(null);
    try {
      const filters: GraphFilters = { source: sourceFilter };
      if (query.trim()) {
        filters.query = query.trim();
      }
      if (minConfidence > 0) {
        filters.minConfidence = minConfidence;
      }
      const data = await window.api.graph.getFiltered(filters);
      setGraph(data);
      const nextMetrics = await window.api.graph.getMetrics();
      setMetrics(nextMetrics);
      setIsolated(false);
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
  }, [minConfidence, query, sourceFilter]);

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

  const handleStopAutoScan = useCallback((): void => {
    autoScanCancelRef.current = true;
    setNotice('Stopping auto scan after current target...');
  }, []);

  const handleAutoScan = useCallback(async (): Promise<void> => {
    if (autoScanInProgress || scanInProgress) {
      return;
    }

    setError(null);
    setNotice(null);

    let sourceNodes = graph.nodes;
    try {
      const fullGraph = await window.api.graph.get();
      sourceNodes = fullGraph.nodes;
    } catch {
      // Fall back to currently loaded graph nodes.
    }

    const scannedKeys = new Set<string>();
    if (unscannedOnly) {
      try {
        const history = await window.api.recon.getHistory();
        history.forEach((result) => {
          scannedKeys.add(scanKey({ target: result.target, type: result.type }));
        });
      } catch (historyError) {
        const message =
          historyError instanceof Error
            ? historyError.message
            : 'Unable to load scan history';
        setError(message);
        return;
      }
    }

    const seen = new Set<string>();
    const targets: Array<{ target: string; type: TargetType }> = [];
    for (const node of sourceNodes) {
      const payload = toScanPayload(node);
      if (!payload) {
        continue;
      }
      const key = scanKey(payload);
      if (seen.has(key) || scannedKeys.has(key)) {
        continue;
      }
      seen.add(key);
      targets.push(payload);
    }

    if (targets.length === 0) {
      setNotice(
        unscannedOnly
          ? 'No unscanned nodes found. Every scannable node already has a scan.'
          : 'No scannable nodes found for auto scan.',
      );
      return;
    }

    const confirmed = window.confirm(
      unscannedOnly
        ? `Auto scan ${targets.length} unscanned node(s)? Already scanned nodes will be skipped.`
        : `Auto scan ${targets.length} scannable node(s)? This runs sequentially and may take a while.`,
    );
    if (!confirmed) {
      return;
    }

    autoScanCancelRef.current = false;
    setAutoScanInProgress(true);
    setScanInProgress(true);

    let completed = 0;
    let failed = 0;

    try {
      for (const payload of targets) {
        if (autoScanCancelRef.current) {
          break;
        }
        setNotice(`Auto scan ${completed + 1}/${targets.length}: ${payload.target} (${payload.type})`);
        try {
          await window.api.recon.scan(payload);
          completed += 1;
        } catch {
          failed += 1;
        }
      }

      await loadGraph({ preserveViewport: true });

      if (autoScanCancelRef.current) {
        setNotice(
          `Auto scan stopped. Completed ${completed}/${targets.length}` +
            (failed > 0 ? ` (${failed} failed)` : '') +
            '.',
        );
      } else {
        setNotice(
          `Auto scan finished. Completed ${completed}/${targets.length}` +
            (failed > 0 ? ` (${failed} failed)` : '') +
            '.',
        );
      }
    } catch (autoScanError) {
      const message =
        autoScanError instanceof Error ? autoScanError.message : 'Unable to run auto scan';
      setError(message);
    } finally {
      autoScanCancelRef.current = false;
      setAutoScanInProgress(false);
      setScanInProgress(false);
    }
  }, [autoScanInProgress, graph.nodes, loadGraph, scanInProgress, unscannedOnly]);

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
        setIsolated(true);
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
      setHiddenTypes(new Set());
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
    setHiddenTypes(new Set());
    setMinConfidence(0);
    setSourceFilter('all');
    setVisualFocus(false);
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
        setSelectedNodeId(deepLinkNodeId);
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
    <section>
      <ScreenHeader
        title="Network"
        subtitle="Relationship graph between scanned targets."
      />

      <div className="mb-3 flex overflow-hidden rounded-[10px] border border-rt-border bg-rt-surface">
        {[
          { label: 'NODES', value: String(metrics.nodeCount), accent: false },
          { label: 'EDGES', value: String(metrics.edgeCount), accent: false },
          { label: 'AVG CONFIDENCE', value: metrics.avgConfidence.toFixed(2), accent: true },
          { label: 'AVG WEIGHT', value: metrics.avgWeight.toFixed(2), accent: false },
        ].map((cell, index) => (
          <div
            key={cell.label}
            className={`flex-1 px-[18px] py-3 ${index < 3 ? 'border-r border-rt-border' : ''}`}
          >
            <div className="text-[10.5px] font-medium tracking-[0.07em] text-rt-dim">{cell.label}</div>
            <div
              className={`mt-0.5 text-[22px] font-semibold tracking-[-0.02em] tabular ${
                cell.accent ? 'text-rt-accent-light' : 'text-rt-strong'
              }`}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void loadGraph({ preserveViewport: true })}>
          <RefreshIcon />
          Refresh graph
        </Button>
        {autoScanInProgress ? (
          <Button variant="warning" className="px-3 py-1.5 text-xs" onClick={handleStopAutoScan}>
            Stop auto scan
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            disabled={scanInProgress}
            onClick={() => void handleAutoScan()}
          >
            Auto scan
          </Button>
        )}
        <button
          type="button"
          disabled={autoScanInProgress}
          onClick={() => setUnscannedOnly((current) => !current)}
          className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium ${
            unscannedOnly
              ? 'border border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.12)] text-sky-300'
              : 'border border-rt-border bg-rt-raised text-rt-dim'
          } ${autoScanInProgress ? 'opacity-60' : ''}`}
        >
          <span
            className={`block h-1.5 w-1.5 rounded-full ${
              unscannedOnly ? 'bg-rt-accent' : 'bg-rt-faint'
            }`}
          />
          Unscanned only: {unscannedOnly ? 'on' : 'off'}
        </button>
        <Button
          variant="ghost"
          className="px-3 py-1.5 text-xs"
          onClick={() => {
            resetAllFilters();
            void loadGraph({ preserveViewport: true });
          }}
        >
          Reset filters
        </Button>
        <button
          type="button"
          onClick={() => void toggleLiveEnrichment()}
          className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium ${
            enrichmentSettings?.liveEnrichmentEnabled
              ? 'border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.12)] text-emerald-400'
              : 'border border-rt-border bg-rt-raised text-rt-dim'
          }`}
        >
          <span
            className={`block h-1.5 w-1.5 rounded-full ${
              enrichmentSettings?.liveEnrichmentEnabled ? 'bg-rt-success' : 'bg-rt-faint'
            }`}
          />
          Live enrichment: {enrichmentSettings?.liveEnrichmentEnabled ? 'on' : 'off'}
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-rt-dim">Layout</span>
          <Segmented
            value={layoutMode}
            options={['Rings', 'Force'] as const}
            onChange={setLayoutMode}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-rt-dim">View</span>
          <Segmented
            value={viewMode}
            options={['2D', '3D'] as const}
            onChange={setViewMode}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-rt-dim">Leaves</span>
          <Segmented
            value={leavesMode}
            options={['Collapsed', 'Expanded'] as const}
            onChange={setLeavesMode}
          />
        </div>
        <button
          type="button"
          onClick={() => setVisualFocus((current) => !current)}
          className={
            visualFocus
              ? 'rounded-[7px] border border-[rgba(139,92,246,0.45)] bg-[rgba(139,92,246,0.16)] px-3 py-1.5 text-xs font-medium text-violet-300'
              : 'rounded-[7px] border border-rt-border bg-transparent px-3 py-1.5 text-xs font-medium text-rt-muted'
          }
        >
          Focus mode
        </button>
        {isolated ? (
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-xs"
            onClick={() => void loadGraph({ preserveViewport: true })}
          >
            Exit isolate
          </Button>
        ) : null}
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => setFiltersVisible((current) => !current)}
        >
          {filtersVisible ? 'Hide filters' : 'Show filters'}
        </Button>
      </div>

      {filtersVisible ? (
        <div className="mb-3 rounded-[10px] border border-rt-border bg-rt-surface px-4 py-3.5">
          <div className="flex items-center gap-3.5">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search node value…"
              leading={<SearchIcon size={13} stroke="#475569" />}
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-rt-dim">Source</span>
              <Segmented
                value={sourceFilter}
                options={['all', 'passive', 'live', 'manual'] as const}
                onChange={setSourceFilter}
              />
            </div>
            <div className="flex w-[240px] items-center gap-2.5">
              <span className="whitespace-nowrap text-[11px] text-rt-dim">Min confidence</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={minConfidence}
                onChange={(event) => setMinConfidence(Number(event.target.value))}
                className="rt-slider flex-1"
                style={{ ['--rt-fill' as string]: `${Math.round(minConfidence * 100)}%` }}
              />
              <span className="w-[26px] text-[11.5px] text-rt-text tabular">
                {minConfidence.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {LEGEND_NODE_TYPES.map((type) => {
              const active = !hiddenTypes.has(type);
              return (
                <Chip
                  key={type}
                  active={active}
                  onClick={() =>
                    setHiddenTypes((current) => {
                      const next = new Set(current);
                      if (next.has(type)) {
                        next.delete(type);
                      } else {
                        next.add(type);
                      }
                      return next;
                    })
                  }
                >
                  <Dot type={type} size={6} />
                  {type}
                </Chip>
              );
            })}
          </div>
        </div>
      ) : null}

      {autoScanInProgress ? (
        <Toast tone="info" className="mb-3" icon={<Spinner size={13} />}>
          <span>
            {notice ?? 'Auto scan in progress'}
          </span>
        </Toast>
      ) : null}
      {!autoScanInProgress && error ? (
        <Toast
          tone="error"
          className="mb-3"
          icon={<AlertIcon size={14} stroke="#fb7185" />}
          action={
            onOpenSettings ? (
              <Button variant="danger" className="px-[11px] py-1 text-[11.5px]" onClick={onOpenSettings}>
                Open settings
              </Button>
            ) : null
          }
        >
          {error}
        </Toast>
      ) : null}
      {!autoScanInProgress && !error && notice ? (
        <Toast tone="success" className="mb-3">
          {notice}
        </Toast>
      ) : null}

      {graph.nodes.length === 0 && !loading ? (
        <EmptyState
          tall
          title="No relationship to draw"
          description="The graph is built from stored scans. Run a recon or import a snapshot to populate it."
        />
      ) : (
        <NetworkGraph
          data={graph}
          nodeDetails={nodeDetails}
          selectedNodeId={selectedNodeId}
          hiddenTypes={hiddenTypes}
          focusMode={visualFocus}
          layoutMode={layoutMode}
          viewMode={viewMode}
          leavesMode={leavesMode}
          onSelectNode={setSelectedNodeId}
          onScanNode={handleScanNode}
          onDeleteNode={handleDeleteNode}
          onRequestNodeDetails={handleRequestNodeDetails}
          onFocusNode={handleFocusNode}
          onDedicatedNodeAction={handleDedicatedNodeAction}
          scanInProgress={scanInProgress}
          deleteInProgress={deleteInProgress}
          focusInProgress={focusInProgress}
        />
      )}
    </section>
  );
};
