import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Button, Dot, TypeBadge } from '@renderer/components/ui';
import { LINK_DIM, LINK_TREE, LINK_TREE_ACTIVE, crossLinkStyle, treeLinkStyle } from '@renderer/lib/graphStyle';
import { buildNodeSummary, edgesForNode } from '@renderer/lib/nodeSummary';
import {
  RING_FRACTION,
  RING_LABELS,
  buildRadialLayout,
  collapsedGraphForForce,
  type LaidOutLink,
  type LaidOutNode,
  type LeavesMode,
} from '@renderer/lib/radialLayout';
import { LEGEND_NODE_TYPES, nodeColor } from '@renderer/theme/nodeColors';
import type {
  GraphData,
  GraphNodeDetails,
  GraphNodeType,
  TargetType,
} from '@shared/types';

type LayoutMode = 'Rings' | 'Force';
export type ViewMode = '2D' | '3D';

const NetworkGraph3D = lazy(async () => {
  const module = await import('@renderer/components/NetworkGraph3D');
  return { default: module.NetworkGraph3D };
});

interface GraphNode {
  id: number;
  name: string;
  type: GraphNodeType;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: number | GraphNode;
  target: number | GraphNode;
  type: string;
  weight: number;
  confidence: number;
}

interface NetworkGraphProps {
  data: GraphData;
  nodeDetails: GraphNodeDetails | null;
  selectedNodeId: number | null;
  hiddenTypes: Set<GraphNodeType>;
  focusMode: boolean;
  layoutMode: LayoutMode;
  viewMode: ViewMode;
  leavesMode: LeavesMode;
  onSelectNode: (nodeId: number | null) => void;
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

const isScannableType = (type: GraphNodeType): type is TargetType =>
  type === 'domain' ||
  type === 'ip' ||
  type === 'email' ||
  type === 'url' ||
  type === 'cidr' ||
  type === 'asn' ||
  type === 'nameserver' ||
  type === 'mx';

const hexToRgba = (hex: string, alpha: number): string => {
  const sanitized = hex.replace('#', '');
  const value =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : sanitized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const resolveNodeId = (endpoint: unknown): number | null => {
  if (typeof endpoint === 'number') {
    return endpoint;
  }
  if (endpoint && typeof endpoint === 'object' && 'id' in endpoint) {
    const candidate = (endpoint as { id?: unknown }).id;
    return typeof candidate === 'number' ? candidate : null;
  }
  return null;
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;
const PAN_THRESHOLD_PX = 4;

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

const IDENTITY_VIEW: ViewTransform = { x: 0, y: 0, k: 1 };

const truncateLabel = (value: string): string =>
  value.length > 22 ? `${value.slice(0, 21)}…` : value;

const nodeDrawRadius = (degree: number, isRoot: boolean, selected: boolean): number => {
  const base = isRoot ? 7.5 : 3.1;
  return base + Math.min(degree, 10) * 0.32 + (selected ? 1.4 : 0);
};

const treeCurve = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
): string => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const qx = cx + (mx - cx) * 0.4;
  const qy = cy + (my - cy) * 0.4;
  return `M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`;
};

interface LabelBox {
  id: number;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  fill: string;
  pinned: boolean;
  priority: number;
}

const LABEL_LINE_HEIGHT = 13;
const LABEL_CHAR_WIDTH = 6.2;
const LABEL_PAD = 3;

const labelBounds = (
  label: LabelBox,
): { left: number; right: number; top: number; bottom: number } => {
  const width = Math.max(22, label.text.length * LABEL_CHAR_WIDTH);
  const left = label.anchor === 'end' ? label.x - width : label.x;
  return {
    left: left - LABEL_PAD,
    right: left + width + LABEL_PAD,
    top: label.y - LABEL_LINE_HEIGHT / 2,
    bottom: label.y + LABEL_LINE_HEIGHT / 2,
  };
};

const labelsOverlap = (a: LabelBox, b: LabelBox): boolean => {
  const boxA = labelBounds(a);
  const boxB = labelBounds(b);
  return !(
    boxA.right < boxB.left ||
    boxA.left > boxB.right ||
    boxA.bottom < boxB.top ||
    boxA.top > boxB.bottom
  );
};

const declutterLabels = (candidates: LabelBox[]): LabelBox[] => {
  const ordered = [...candidates].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.priority - a.priority;
  });
  const kept: LabelBox[] = [];
  ordered.forEach((candidate) => {
    const collides = kept.some((other) => labelsOverlap(candidate, other));
    if (collides && !candidate.pinned) {
      return;
    }
    kept.push(candidate);
  });
  return kept;
};

export const NetworkGraph = ({
  data,
  nodeDetails,
  selectedNodeId,
  hiddenTypes,
  focusMode,
  layoutMode,
  viewMode,
  leavesMode,
  onSelectNode,
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    moved: boolean;
    hit: 'bg' | 'node' | 'badge';
    nodeId: number | null;
  } | null>(null);
  const [size, setSize] = useState({ width: 960, height: 560 });
  const [localExpanded, setLocalExpanded] = useState<Set<number>>(new Set());
  const [view, setView] = useState<ViewTransform>(IDENTITY_VIEW);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const update = (): void => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(640, Math.floor(rect.width)),
        height: Math.max(520, Math.floor(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLocalExpanded(new Set());
  }, [leavesMode]);

  useEffect(() => {
    setView(IDENTITY_VIEW);
    setPanning(false);
    dragRef.current = null;
  }, [layoutMode]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || layoutMode !== 'Rings') {
      return;
    }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const mx = ((event.clientX - rect.left) / rect.width) * size.width;
      const my = ((event.clientY - rect.top) / rect.height) * size.height;
      const factor = Math.exp(-event.deltaY * 0.002);
      setView((current) => {
        const nextK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
        if (nextK === current.k) {
          return current;
        }
        const worldX = (mx - current.x) / current.k;
        const worldY = (my - current.y) / current.k;
        return {
          k: nextK,
          x: mx - worldX * nextK,
          y: my - worldY * nextK,
        };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [layoutMode, size.height, size.width]);

  const forceData = useMemo(
    () => collapsedGraphForForce(data, leavesMode, localExpanded),
    [data, leavesMode, localExpanded],
  );

  const cx = size.width / 2;
  const cy = size.height / 2 - 8;
  const maxR = Math.max(80, Math.min(cx, cy) - 42);

  const radial = useMemo(
    () =>
      buildRadialLayout(data, {
        cx,
        cy,
        maxR,
        leavesMode,
        localExpanded,
      }),
    [cx, cy, data, leavesMode, localExpanded, maxR],
  );

  const massById = useMemo(() => {
    const map = new Map<number, number>();
    data.edges.forEach((edge) => {
      const weight = edge.weight ?? 1;
      map.set(edge.source_id, (map.get(edge.source_id) ?? 0) + weight);
      map.set(edge.target_id, (map.get(edge.target_id) ?? 0) + weight);
    });
    return map;
  }, [data.edges]);

  const byId = useMemo(() => {
    const map = new Map<number, LaidOutNode>();
    radial.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [radial.nodes]);

  const neighborIds = useMemo(() => {
    const near = new Set<number>();
    if (selectedNodeId === null) {
      return near;
    }
    near.add(selectedNodeId);
    data.edges.forEach((edge) => {
      if (edge.source_id === selectedNodeId) {
        near.add(edge.target_id);
      }
      if (edge.target_id === selectedNodeId) {
        near.add(edge.source_id);
      }
    });
    return near;
  }, [data.edges, selectedNodeId]);

  const selectedLaidOut = selectedNodeId === null ? null : (byId.get(selectedNodeId) ?? null);
  const selectedFallback = data.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedName = selectedLaidOut?.name ?? selectedFallback?.value ?? '';
  const selectedType = selectedLaidOut?.type ?? selectedFallback?.type ?? 'domain';
  const selectedDegree =
    selectedLaidOut?.degree ??
    data.edges.filter(
      (edge) => edge.source_id === selectedNodeId || edge.target_id === selectedNodeId,
    ).length;

  const selectedEdges = useMemo(() => {
    if (selectedNodeId === null) {
      return [];
    }
    const edges = edgesForNode(selectedNodeId, data, nodeDetails?.edges);
    return [...edges]
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 10)
      .map((edge) => {
        const neighborId = edge.source_id === selectedNodeId ? edge.target_id : edge.source_id;
        const neighbor =
          nodeDetails?.neighbors.find((item) => item.id === neighborId) ??
          data.nodes.find((item) => item.id === neighborId);
        return { edge, neighbor };
      });
  }, [data, nodeDetails, selectedNodeId]);

  const nodeSummary = useMemo(() => {
    const node = nodeDetails?.node ?? selectedFallback;
    if (!node || selectedNodeId === null) {
      return null;
    }
    const edges = edgesForNode(selectedNodeId, data, nodeDetails?.edges);
    return buildNodeSummary(node, data, edges, selectedLaidOut?.ring === 'center');
  }, [data, nodeDetails, selectedFallback, selectedLaidOut, selectedNodeId]);

  const avgConfidence = nodeSummary?.avgConfidence ?? 0;
  const avgWeight = nodeSummary?.avgWeight ?? 0;

  const labels = useMemo(() => {
    const raw: LabelBox[] = [];
    radial.nodes.forEach((node) => {
      const selected = node.id === selectedNodeId;
      if (hiddenTypes.has(node.type) && !selected) {
        return;
      }
      if (node.isLeaf && !selected) {
        return;
      }
      const named = focusMode
        ? neighborIds.has(node.id)
        : node.ring === 'center' ||
          node.ring === 'identity' ||
          node.degree >= 6 ||
          selected;
      if (!named) {
        return;
      }
      const r = nodeDrawRadius(node.degree, node.ring === 'center', selected);
      const right = node.x >= cx;
      raw.push({
        id: node.id,
        text: truncateLabel(node.name),
        x: right ? node.x + r + 8 : node.x - r - 8,
        y: node.y,
        anchor: right ? 'start' : 'end',
        fill: selected ? '#f8fafc' : '#64748b',
        pinned: selected || node.ring === 'center',
        priority:
          (selected ? 1000 : 0) +
          (node.ring === 'center' ? 400 : 0) +
          node.degree * 8 +
          (node.ring === 'identity' ? 20 : 0),
      });
    });
    return declutterLabels(raw);
  }, [cx, focusMode, hiddenTypes, neighborIds, radial.nodes, selectedNodeId]);

  const copyNodeValue = async (value: string): Promise<void> => {
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

  const handleSelect = (nodeId: number): void => {
    onSelectNode(nodeId);
    void onRequestNodeDetails(nodeId).catch(() => undefined);
  };

  const hitFromEvent = (
    event: ReactPointerEvent<SVGSVGElement>,
  ): { hit: 'bg' | 'node' | 'badge'; nodeId: number | null } => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return { hit: 'bg', nodeId: null };
    }
    const badge = target.closest('[data-expand-parent]');
    if (badge) {
      const id = Number(badge.getAttribute('data-expand-parent'));
      return { hit: 'badge', nodeId: Number.isFinite(id) ? id : null };
    }
    const node = target.closest('[data-node-id]');
    if (node) {
      const id = Number(node.getAttribute('data-node-id'));
      return { hit: 'node', nodeId: Number.isFinite(id) ? id : null };
    }
    return { hit: 'bg', nodeId: null };
  };

  const handleSvgPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) {
      return;
    }
    const hit = hitFromEvent(event);
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      hit: hit.hit,
      nodeId: hit.nodeId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSvgPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const dx = ((event.clientX - drag.lastX) / rect.width) * size.width;
    const dy = ((event.clientY - drag.lastY) / rect.height) * size.height;
    if (!drag.moved) {
      const dist = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (dist < PAN_THRESHOLD_PX) {
        return;
      }
      drag.moved = true;
      setPanning(true);
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };

  const handleSvgPointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const nodeId = drag.nodeId;
    const hit = drag.hit;
    const moved = drag.moved;
    dragRef.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (moved) {
      return;
    }
    if (hit === 'badge' && nodeId !== null) {
      setLocalExpanded((current) => {
        const next = new Set(current);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
      return;
    }
    if (hit === 'node' && nodeId !== null) {
      handleSelect(nodeId);
      return;
    }
    onSelectNode(null);
  };

  const handleSvgDoubleClick = (event: ReactMouseEvent<SVGSVGElement>): void => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-node-id]')) {
      return;
    }
    setView(IDENTITY_VIEW);
  };

  const handleDeleteSelectedNode = async (): Promise<void> => {
    if (selectedNodeId === null) {
      return;
    }
    await onDeleteNode({
      nodeId: selectedNodeId,
      deleteUniqueNeighbors: false,
    });
    onSelectNode(null);
  };

  const forceNodes: GraphNode[] = useMemo(
    () =>
      forceData.nodes.map((node) => ({
        id: node.id,
        name: node.value,
        type: node.type,
      })),
    [forceData.nodes],
  );
  const forceLinks: GraphLink[] = useMemo(
    () =>
      forceData.edges.map((edge) => ({
        source: edge.source_id,
        target: edge.target_id,
        type: edge.type,
        weight: edge.weight ?? 1,
        confidence: edge.confidence ?? 0,
      })),
    [forceData.edges],
  );
  const forceDegree = useMemo(() => {
    const map = new Map<number, number>();
    forceLinks.forEach((link) => {
      const sourceId = resolveNodeId(link.source);
      const targetId = resolveNodeId(link.target);
      if (sourceId !== null) {
        map.set(sourceId, (map.get(sourceId) ?? 0) + 1);
      }
      if (targetId !== null) {
        map.set(targetId, (map.get(targetId) ?? 0) + 1);
      }
    });
    return map;
  }, [forceLinks]);

  const linkStyle = useCallback(
    (link: LaidOutLink): { stroke: string; width: number; opacity: number } => {
      const touch =
        selectedNodeId !== null &&
        (link.sourceId === selectedNodeId || link.targetId === selectedNodeId);
      const sourceOk = !focusMode || neighborIds.has(link.sourceId);
      const targetOk = !focusMode || neighborIds.has(link.targetId);
      if (!sourceOk || !targetOk) {
        return { stroke: '#334155', width: 0.4, opacity: 0.08 };
      }
      if (link.tree) {
        return treeLinkStyle(link, touch);
      }
      return crossLinkStyle(touch);
    },
    [focusMode, neighborIds, selectedNodeId],
  );

  const leafHint =
    leavesMode === 'Expanded'
      ? 'Toutes les feuilles dépliées'
      : 'Ports, services, OS et URLs repliés au-delà de 3 par parent — clic +n pour déplier';

  return (
    <div
      ref={containerRef}
      className="relative h-[560px] min-h-[520px] overflow-hidden rounded-[10px] border border-rt-border bg-[#060d1c]"
    >
      {viewMode === '3D' ? (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-[12px] text-rt-dim">
              Loading 3D view…
            </div>
          }
        >
          <NetworkGraph3D
            layoutMode={layoutMode}
            radialNodes={radial.nodes}
            radialLinks={radial.links}
            forceData={forceData}
            massById={massById}
            selectedNodeId={selectedNodeId}
            hiddenTypes={hiddenTypes}
            focusMode={focusMode}
            neighborIds={neighborIds}
            width={size.width}
            height={size.height}
            cx={cx}
            cy={cy}
            maxR={maxR}
            onSelectNode={(nodeId) => {
              if (nodeId === null) {
                onSelectNode(null);
                return;
              }
              handleSelect(nodeId);
            }}
          />
        </Suspense>
      ) : layoutMode === 'Rings' ? (
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.width} ${size.height}`}
          className={`block h-full w-full touch-none select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerCancel={handleSvgPointerUp}
          onDoubleClick={handleSvgDoubleClick}
        >
          <defs>
            <pattern id="rtgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#0f1a2e" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={size.width} height={size.height} fill="url(#rtgrid)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {RING_LABELS.map((entry) => {
            const r = RING_FRACTION[entry.ring] * maxR;
            return (
              <g key={entry.ring}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="1"
                  opacity="0.85"
                />
                <text
                  x={cx}
                  y={cy - r - 6}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize="10"
                  fontWeight="600"
                  letterSpacing="0.14em"
                >
                  {entry.label}
                </text>
              </g>
            );
          })}
          {radial.links.map((link) => {
            const source = byId.get(link.sourceId);
            const target = byId.get(link.targetId);
            if (!source || !target) {
              return null;
            }
            const style = linkStyle(link);
            if (link.tree) {
              return (
                <path
                  key={`${link.sourceId}-${link.targetId}-tree`}
                  d={treeCurve(source.x, source.y, target.x, target.y, cx, cy)}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeOpacity={style.opacity}
                />
              );
            }
            return (
              <line
                key={`${link.sourceId}-${link.targetId}-cross`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeOpacity={style.opacity}
              />
            );
          })}
          {radial.nodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const r = nodeDrawRadius(node.degree, node.ring === 'center', selected);
            const hidden = hiddenTypes.has(node.type);
            const inFocus = !focusMode || neighborIds.has(node.id);
            const op = inFocus ? (hidden ? 0.18 : 1) : 0.12;
            const color = nodeColor(node.type);
            const badgeX = node.x + Math.cos(node.theta) * (r + 12);
            const badgeY = node.y + Math.sin(node.theta) * (r + 12);
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                opacity={op}
                style={{ cursor: 'pointer' }}
              >
                {selected ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r * 2.3}
                    fill={hexToRgba(color, 0.16)}
                  />
                ) : null}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={color}
                  stroke={selected ? '#f8fafc' : '#020617'}
                  strokeWidth={selected ? 1.6 : 1}
                />
                {node.collapsedCount > 0 ? (
                  <g data-expand-parent={node.id} style={{ cursor: 'pointer' }}>
                    <rect
                      x={badgeX - 11}
                      y={badgeY - 7}
                      width="22"
                      height="14"
                      rx="7"
                      fill="#0b1220"
                      stroke="#334155"
                    />
                    <text
                      x={badgeX}
                      y={badgeY + 3.5}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="JetBrains Mono, ui-monospace, monospace"
                    >
                      +{node.collapsedCount}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
          {labels.map((label) => (
            <text
              key={`label-${label.id}`}
              x={label.x}
              y={label.y + 3}
              textAnchor={label.anchor}
              fill={label.fill}
              fontSize="10.5"
              fontFamily="JetBrains Mono, ui-monospace, monospace"
              className="pointer-events-none"
            >
              {label.text}
            </text>
          ))}
          </g>
        </svg>
      ) : (
        <ForceGraph2D
          graphData={{ nodes: forceNodes, links: forceLinks }}
          backgroundColor="#060d1c"
          nodeLabel={(node) => (node as GraphNode).name}
          nodeRelSize={1}
          nodeVal={(node) =>
            nodeDrawRadius(forceDegree.get((node as GraphNode).id) ?? 0, false, false)
          }
          d3AlphaDecay={0.04}
          d3VelocityDecay={0.35}
          cooldownTicks={140}
          enableNodeDrag
          onRenderFramePre={(ctx) => {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#060d1c';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.strokeStyle = '#0f1a2e';
            ctx.lineWidth = 1;
            const step = 40 * (window.devicePixelRatio || 1);
            for (let x = 0; x < ctx.canvas.width; x += step) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, ctx.canvas.height);
              ctx.stroke();
            }
            for (let y = 0; y < ctx.canvas.height; y += step) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(ctx.canvas.width, y);
              ctx.stroke();
            }
            ctx.restore();
          }}
          nodeCanvasObject={(node, ctx) => {
            const graphNode = node as GraphNode;
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const selected = graphNode.id === selectedNodeId;
            const degree = forceDegree.get(graphNode.id) ?? 0;
            const r = nodeDrawRadius(degree, false, selected);
            const color = nodeColor(graphNode.type);
            const inFocus = !focusMode || neighborIds.has(graphNode.id);
            const hidden = hiddenTypes.has(graphNode.type);
            const op = inFocus ? (hidden ? 0.18 : 1) : 0.12;
            ctx.save();
            ctx.globalAlpha = op;
            if (selected) {
              ctx.beginPath();
              ctx.arc(x, y, r * 2.3, 0, Math.PI * 2);
              ctx.fillStyle = hexToRgba(color, 0.16);
              ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = selected ? 1.6 : 1;
            ctx.strokeStyle = selected ? '#f8fafc' : '#020617';
            ctx.stroke();
            const named = focusMode
              ? neighborIds.has(graphNode.id)
              : degree >= 6 || selected;
            if (named) {
              ctx.font = '10.5px "JetBrains Mono", ui-monospace, monospace';
              ctx.textAlign = x >= 0 ? 'left' : 'right';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = selected ? '#f8fafc' : '#64748b';
              ctx.fillText(truncateLabel(graphNode.name), x >= 0 ? x + r + 8 : x - r - 8, y);
            }
            ctx.restore();
          }}
          linkColor={(link) => {
            const runtime = link as GraphLink;
            const sourceId = resolveNodeId(runtime.source);
            const targetId = resolveNodeId(runtime.target);
            const touch =
              selectedNodeId !== null &&
              (sourceId === selectedNodeId || targetId === selectedNodeId);
            const active =
              !focusMode ||
              (sourceId !== null &&
                targetId !== null &&
                neighborIds.has(sourceId) &&
                neighborIds.has(targetId));
            if (!active) {
              return hexToRgba(LINK_DIM, 0.08);
            }
            if (touch) {
              return hexToRgba(LINK_TREE_ACTIVE, 0.92);
            }
            return hexToRgba(LINK_TREE, 0.42 + runtime.confidence * 0.28);
          }}
          linkWidth={(link) => 1.05 + (link as GraphLink).weight / 12}
          onNodeClick={(node) => handleSelect((node as GraphNode).id)}
          onBackgroundClick={() => onSelectNode(null)}
        />
      )}

      <div
        className={`pointer-events-none absolute top-[72px] max-h-[min(420px,70%)] overflow-y-auto rounded-[9px] border border-rt-border bg-[rgba(11,18,32,0.92)] px-3 py-2.5 backdrop-blur-[4px] ${
          selectedFallback || selectedLaidOut ? 'right-[338px]' : 'right-3.5'
        }`}
      >
        <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-rt-dim">
          LEGEND · NODE TYPE
        </div>
        <div className="flex flex-col gap-1">
          {LEGEND_NODE_TYPES.map((type) => (
            <span key={type} className="flex items-center gap-1.5 font-mono text-[11px] text-rt-muted">
              <Dot type={type} size={6} />
              {type}
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex flex-col gap-0.5 border-t border-rt-border pt-2 text-[10.5px] text-rt-dim">
          <span>ring = distance to target</span>
          <span>size = connections</span>
          <span>thickness = weight</span>
          {viewMode === '3D' ? <span>depth = node weight</span> : null}
          <span>+n = feuilles repliées</span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2.5 left-3.5 text-[11px] text-rt-faint">
        {viewMode === '3D'
          ? 'Glisser pour orbiter · molette pour zoomer · le poids enfonce les nœuds'
          : leafHint}
      </div>

      {selectedFallback || selectedLaidOut ? (
        <aside className="absolute bottom-3.5 right-3.5 top-3.5 flex w-[318px] flex-col rounded-[10px] border border-rt-border-strong bg-[rgba(15,23,42,0.96)] shadow-float backdrop-blur-[6px]">
          <div className="border-b border-rt-border px-[15px] pb-3 pt-3.5">
            <div className="flex items-start gap-[9px]">
              <Dot type={selectedType} size={9} />
              <div className="min-w-0 flex-1">
                <div className="break-all font-mono text-[13.5px] font-semibold text-rt-strong">
                  {selectedName}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <TypeBadge type={selectedType} />
                  <span className="text-[11px] text-rt-dim">{selectedDegree} neighbours</span>
                </div>
              </div>
              <button
                type="button"
                className="bg-transparent p-0 text-[15px] leading-none text-rt-faint"
                onClick={() => onSelectNode(null)}
              >
                ×
              </button>
            </div>
            <div className="mt-3 flex gap-1.5">
              <Button
                className="flex-1 rounded-md py-1.5 text-[11.5px]"
                disabled={scanInProgress || selectedNodeId === null}
                onClick={() =>
                  isScannableType(selectedType)
                    ? void onScanNode({ target: selectedName, type: selectedType })
                    : selectedNodeId !== null
                      ? void onDedicatedNodeAction({
                          nodeId: selectedNodeId,
                          name: selectedName,
                          type: selectedType,
                        })
                      : undefined
                }
              >
                {scanInProgress ? 'Scanning…' : 'Scan node'}
              </Button>
              <Button
                variant="secondary"
                className="flex-1 rounded-md py-1.5 text-[11.5px]"
                disabled={focusInProgress || selectedNodeId === null}
                onClick={() =>
                  selectedNodeId !== null
                    ? void onFocusNode({ nodeId: selectedNodeId, hops: 1 })
                    : undefined
                }
              >
                Isolate
              </Button>
              <Button
                variant="secondary"
                className="rounded-md px-[9px] py-1.5 text-[11.5px]"
                onClick={() => void copyNodeValue(selectedName)}
              >
                ⧉
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 border-b border-rt-border px-[15px] py-3">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.07em] text-rt-dim">
                CONFIDENCE
              </div>
              <div className="mt-0.5 text-[17px] font-semibold text-rt-accent-light tabular">
                {avgConfidence.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-[0.07em] text-rt-dim">WEIGHT</div>
              <div className="mt-0.5 text-[17px] font-semibold text-rt-heading tabular">
                {avgWeight.toFixed(1)}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-[15px] py-3">
            {nodeSummary ? (
              <div className="mb-3.5">
                <div className="mb-2 text-[10px] font-semibold tracking-[0.07em] text-rt-dim">
                  SUMMARY
                </div>
                <p className="text-[12px] leading-[1.45] text-rt-text">{nodeSummary.sentence}</p>
                {nodeSummary.seen ? (
                  <p className="mt-1.5 text-[11px] text-rt-dim">Last seen {nodeSummary.seen}</p>
                ) : null}
                {nodeSummary.neighborTypes.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {nodeSummary.neighborTypes.slice(0, 6).map((entry) => (
                      <span
                        key={entry.type}
                        className="inline-flex items-center gap-1 rounded-md border border-rt-border bg-rt-raised px-1.5 py-0.5 font-mono text-[10.5px] text-rt-muted"
                      >
                        <Dot type={entry.type} size={5} />
                        {entry.type}
                        <span className="text-rt-heading tabular">{entry.count}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mb-2 text-[10px] font-semibold tracking-[0.07em] text-rt-dim">
              RELATIONS
            </div>
            <div className="flex flex-col gap-1.5">
              {selectedEdges.length === 0 ? (
                <p className="text-[11.5px] text-rt-faint">No relations in the current graph.</p>
              ) : (
                selectedEdges.map(({ edge, neighbor }) => (
                  <div
                    key={edge.id}
                    className="rounded-[7px] border border-rt-border bg-rt-raised px-2.5 py-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Dot type={neighbor?.type ?? 'domain'} size={6} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-rt-text">
                        {neighbor?.value ?? 'unknown'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-rt-dim">
                      <span className="text-rt-muted">
                        {selectedType}→{neighbor?.type ?? '?'}
                      </span>
                      <span className="block h-[3px] flex-1 overflow-hidden rounded-sm bg-rt-divider">
                        <span
                          className="block h-full rounded-sm bg-rt-accent"
                          style={{ width: `${Math.round((edge.confidence ?? 0) * 100)}%` }}
                        />
                      </span>
                      <span className="tabular">c {(edge.confidence ?? 0).toFixed(2)}</span>
                      <span className="tabular">w {edge.weight ?? 1}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3">
              <Button
                variant="danger"
                className="w-full rounded-md py-1.5 text-[11px]"
                disabled={deleteInProgress}
                onClick={() => void handleDeleteSelectedNode()}
              >
                {deleteInProgress ? 'Deleting…' : 'Delete node'}
              </Button>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
};
