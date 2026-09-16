import { useEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import {
  RING_FRACTION,
  RING_LABELS,
  type LaidOutLink,
  type LaidOutNode,
} from '@renderer/lib/radialLayout';
import {
  LINK_CROSS,
  LINK_CROSS_ACTIVE,
  LINK_DIM,
  LINK_TREE,
  LINK_TREE_ACTIVE,
} from '@renderer/lib/graphStyle';
import { nodeColor } from '@renderer/theme/nodeColors';
import type { GraphData, GraphNodeType } from '@shared/types';

type LayoutMode = 'Rings' | 'Force';

interface Graph3DNode {
  id: number;
  name: string;
  type: GraphNodeType;
  mass: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

interface Graph3DLink {
  source: number | Graph3DNode;
  target: number | Graph3DNode;
  tree: boolean;
  weight: number;
  confidence: number;
}

interface NetworkGraph3DProps {
  layoutMode: LayoutMode;
  radialNodes: LaidOutNode[];
  radialLinks: LaidOutLink[];
  forceData: GraphData;
  massById: Map<number, number>;
  selectedNodeId: number | null;
  hiddenTypes: Set<GraphNodeType>;
  focusMode: boolean;
  neighborIds: Set<number>;
  width: number;
  height: number;
  cx: number;
  cy: number;
  maxR: number;
  onSelectNode: (nodeId: number | null) => void;
}

const WELL_DEPTH = 118;
const ORBIT_RADIUS = 168;

interface WellNode {
  y?: number;
  vy?: number;
  mass?: number;
}

interface GraphApi {
  width: (value: number) => GraphApi;
  height: (value: number) => GraphApi;
  backgroundColor: (value: string) => GraphApi;
  showNavInfo: (value: boolean) => GraphApi;
  graphData: (data: { nodes: Graph3DNode[]; links: Graph3DLink[] }) => GraphApi;
  nodeLabel: (fn: (node: Graph3DNode) => string) => GraphApi;
  nodeRelSize: (value: number) => GraphApi;
  nodeOpacity: (value: number) => GraphApi;
  nodeVal: (fn: (node: Graph3DNode) => number) => GraphApi;
  nodeColor: (fn: (node: Graph3DNode) => string) => GraphApi;
  linkColor: (fn: (link: Graph3DLink) => string) => GraphApi;
  linkWidth: (fn: (link: Graph3DLink) => number) => GraphApi;
  linkOpacity: (value: number) => GraphApi;
  linkVisibility: (fn: (link: Graph3DLink) => boolean) => GraphApi;
  enableNodeDrag: (value: boolean) => GraphApi;
  cooldownTicks: (value: number) => GraphApi;
  warmupTicks: (value: number) => GraphApi;
  d3AlphaDecay: (value: number) => GraphApi;
  d3VelocityDecay: (value: number) => GraphApi;
  d3Force: (name: string, force?: unknown) => unknown;
  cameraPosition: (
    position: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number,
  ) => GraphApi;
  scene: () => THREE.Scene;
  onNodeClick: (fn: (node: Graph3DNode) => void) => GraphApi;
  onBackgroundClick: (fn: () => void) => GraphApi;
  _destructor: () => void;
}

const createWeightWellForce = (
  wellDepth: number,
  maxMass: number,
): ((alpha: number) => void) & { initialize: (input: WellNode[]) => void } => {
  let nodes: WellNode[] = [];
  const force = ((alpha: number): void => {
    const ceiling = Math.max(1, maxMass);
    nodes.forEach((node) => {
      const targetY = -((node.mass ?? 1) / ceiling) * wellDepth;
      node.vy = (node.vy ?? 0) + (targetY - (node.y ?? 0)) * 0.14 * alpha;
    });
  }) as ((alpha: number) => void) & { initialize: (input: WellNode[]) => void };
  force.initialize = (input: WellNode[]): void => {
    nodes = input;
  };
  return force;
};

const resolveId = (endpoint: number | Graph3DNode): number =>
  typeof endpoint === 'number' ? endpoint : endpoint.id;

const hexToRgba = (hex: string, alpha: number): string => {
  const sanitized = hex.replace('#', '');
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const mountForceGraph3D = (element: HTMLElement): GraphApi => {
  const imported = ForceGraph3D as unknown as {
    new (el: HTMLElement, config?: { controlType?: string }): GraphApi;
    (config?: { controlType?: string }): (el: HTMLElement) => GraphApi;
  };
  try {
    return new imported(element, { controlType: 'orbit' });
  } catch {
    return imported({ controlType: 'orbit' })(element);
  }
};

export const NetworkGraph3D = ({
  layoutMode,
  radialNodes,
  radialLinks,
  forceData,
  massById,
  selectedNodeId,
  hiddenTypes,
  focusMode,
  neighborIds,
  width,
  height,
  cx,
  cy,
  maxR,
  onSelectNode,
}: NetworkGraph3DProps): ReactElement => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphApi | null>(null);
  const extrasRef = useRef<THREE.Object3D[]>([]);
  const selectRef = useRef(onSelectNode);
  selectRef.current = onSelectNode;

  const maxMass = useMemo(() => {
    let peak = 1;
    massById.forEach((value) => {
      if (value > peak) {
        peak = value;
      }
    });
    return peak;
  }, [massById]);

  const graphData = useMemo(() => {
    if (layoutMode === 'Rings') {
      const scale = ORBIT_RADIUS / Math.max(maxR, 1);
      return {
        nodes: radialNodes.map((node) => {
          const mass = massById.get(node.id) ?? 1;
          return {
            id: node.id,
            name: node.name,
            type: node.type,
            mass,
            fx: (node.x - cx) * scale,
            fz: (node.y - cy) * scale,
            fy: -(mass / maxMass) * WELL_DEPTH,
          };
        }),
        links: radialLinks.map((link) => ({
          source: link.sourceId,
          target: link.targetId,
          tree: link.tree,
          weight: link.weight,
          confidence: link.confidence,
        })),
      };
    }
    return {
      nodes: forceData.nodes.map((node) => ({
        id: node.id,
        name: node.value,
        type: node.type,
        mass: massById.get(node.id) ?? 1,
      })),
      links: forceData.edges.map((edge) => ({
        source: edge.source_id,
        target: edge.target_id,
        tree: false,
        weight: edge.weight ?? 1,
        confidence: edge.confidence ?? 0,
      })),
    };
  }, [cx, cy, forceData, layoutMode, massById, maxMass, maxR, radialLinks, radialNodes]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const graph = mountForceGraph3D(host);
    graphRef.current = graph;
    graph
      .backgroundColor('#060d1c')
      .showNavInfo(false)
      .nodeRelSize(4.2)
      .nodeOpacity(0.96)
      .linkOpacity(0.85)
      .nodeLabel((node) => node.name)
      .onNodeClick((node) => selectRef.current(node.id))
      .onBackgroundClick(() => selectRef.current(null));
    return () => {
      extrasRef.current.forEach((object) => {
        graph.scene().remove(object);
      });
      extrasRef.current = [];
      graph._destructor();
      graphRef.current = null;
      host.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    graph.width(width).height(height);
  }, [height, width]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    const nodeIsActive = (node: Graph3DNode): boolean => {
      if (hiddenTypes.has(node.type) && node.id !== selectedNodeId) {
        return false;
      }
      return !focusMode || neighborIds.has(node.id);
    };
    graph
      .enableNodeDrag(layoutMode === 'Force')
      .cooldownTicks(layoutMode === 'Rings' ? 0 : 140)
      .warmupTicks(layoutMode === 'Rings' ? 0 : 40)
      .d3AlphaDecay(layoutMode === 'Rings' ? 1 : 0.04)
      .d3VelocityDecay(layoutMode === 'Rings' ? 1 : 0.32)
      .nodeVal((node) => 1.1 + Math.min(node.mass, 36) * 0.12)
      .nodeColor((node) => {
        if (!nodeIsActive(node)) {
          return '#1e293b';
        }
        return node.id === selectedNodeId ? '#f8fafc' : nodeColor(node.type);
      })
      .linkVisibility((link) => {
        if (!focusMode) {
          return true;
        }
        return neighborIds.has(resolveId(link.source)) && neighborIds.has(resolveId(link.target));
      })
      .linkColor((link) => {
        const sourceId = resolveId(link.source);
        const targetId = resolveId(link.target);
        const touch =
          selectedNodeId !== null &&
          (sourceId === selectedNodeId || targetId === selectedNodeId);
        const active =
          !focusMode || (neighborIds.has(sourceId) && neighborIds.has(targetId));
        if (!active) {
          return hexToRgba(LINK_DIM, 0.08);
        }
        if (link.tree) {
          return hexToRgba(touch ? LINK_TREE_ACTIVE : LINK_TREE, touch ? 0.95 : 0.78);
        }
        return hexToRgba(touch ? LINK_CROSS_ACTIVE : LINK_CROSS, touch ? 0.9 : 0.5);
      })
      .linkWidth((link) => {
        const sourceId = resolveId(link.source);
        const targetId = resolveId(link.target);
        const touch =
          selectedNodeId !== null &&
          (sourceId === selectedNodeId || targetId === selectedNodeId);
        return touch ? 2.1 : 1.15 + link.weight / 12;
      })
      .graphData(graphData);
    graph.cameraPosition({ x: 36, y: 188, z: 236 }, { x: 0, y: -42, z: 0 }, 0);
    if (layoutMode === 'Force') {
      graph.d3Force('weightWell', createWeightWellForce(WELL_DEPTH, maxMass));
    }
  }, [
    focusMode,
    graphData,
    hiddenTypes,
    layoutMode,
    maxMass,
    neighborIds,
    selectedNodeId,
  ]);

  useEffect(() => {
    const graph = graphRef.current;
    extrasRef.current.forEach((object) => {
      graph?.scene().remove(object);
    });
    extrasRef.current = [];
    if (!graph || layoutMode !== 'Rings') {
      return;
    }
    const scene = graph.scene();
    const added: THREE.Object3D[] = [];
    RING_LABELS.forEach((entry) => {
      const radius = RING_FRACTION[entry.ring] * ORBIT_RADIUS;
      const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
      const points = curve.getPoints(160).map((point) => new THREE.Vector3(point.x, 0, point.y));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.7,
      });
      const ring = new THREE.LineLoop(geometry, material);
      scene.add(ring);
      added.push(ring);
    });
    const grid = new THREE.GridHelper(ORBIT_RADIUS * 2.2, 18, 0x1e293b, 0x0f1a2e);
    grid.position.y = 0.01;
    scene.add(grid);
    added.push(grid);
    extrasRef.current = added;
    return () => {
      added.forEach((object) => scene.remove(object));
      if (extrasRef.current === added) {
        extrasRef.current = [];
      }
    };
  }, [layoutMode, graphData]);

  return <div ref={hostRef} className="h-full w-full" />;
};
