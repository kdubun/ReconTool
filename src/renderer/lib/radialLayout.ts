import type { GraphData, GraphNodeType, Relation, Target } from '@shared/types';

export type RingName = 'center' | 'identity' | 'hosts' | 'infra' | 'leaf';
export type LeavesMode = 'Collapsed' | 'Expanded';

export const LEAF_TYPES = new Set<GraphNodeType>(['port', 'service', 'os', 'url']);

const RING_ORDER: Record<RingName, number> = {
  center: 0,
  identity: 1,
  hosts: 2,
  infra: 3,
  leaf: 4,
};

export const RING_FRACTION: Record<RingName, number> = {
  center: 0,
  identity: 0.34,
  hosts: 0.55,
  infra: 0.74,
  leaf: 0.92,
};

export const RING_LABELS: Array<{ ring: RingName; label: string }> = [
  { ring: 'identity', label: 'IDENTITY' },
  { ring: 'hosts', label: 'HOSTS' },
  { ring: 'infra', label: 'INFRASTRUCTURE' },
];

export const ringForType = (type: GraphNodeType, isRoot: boolean): RingName => {
  if (isRoot) {
    return 'center';
  }
  if (LEAF_TYPES.has(type)) {
    return 'leaf';
  }
  if (
    type === 'subdomain' ||
    type === 'nameserver' ||
    type === 'mx' ||
    type === 'email' ||
    type === 'domain' ||
    type === 'spf' ||
    type === 'dmarc' ||
    type === 'dkim'
  ) {
    return 'identity';
  }
  if (type === 'ip' || type === 'certificate' || type === 'tls_issuer' || type === 'tech') {
    return 'hosts';
  }
  return 'infra';
};

export interface LaidOutNode {
  id: number;
  name: string;
  type: GraphNodeType;
  ring: RingName;
  x: number;
  y: number;
  theta: number;
  layoutR: number;
  parentId: number | null;
  degree: number;
  collapsedCount: number;
  isLeaf: boolean;
}

export interface LaidOutLink {
  sourceId: number;
  targetId: number;
  tree: boolean;
  weight: number;
  confidence: number;
}

const undirectedAdj = (edges: Relation[]): Map<number, number[]> => {
  const adj = new Map<number, number[]>();
  const add = (from: number, to: number): void => {
    const list = adj.get(from) ?? [];
    list.push(to);
    adj.set(from, list);
  };
  edges.forEach((edge) => {
    add(edge.source_id, edge.target_id);
    add(edge.target_id, edge.source_id);
  });
  return adj;
};

const degreeMap = (edges: Relation[]): Map<number, number> => {
  const map = new Map<number, number>();
  edges.forEach((edge) => {
    map.set(edge.source_id, (map.get(edge.source_id) ?? 0) + 1);
    map.set(edge.target_id, (map.get(edge.target_id) ?? 0) + 1);
  });
  return map;
};

export const pickRoot = (nodes: Target[], edges: Relation[]): Target | null => {
  if (nodes.length === 0) {
    return null;
  }
  const degree = degreeMap(edges);
  const scored = [...nodes].sort((a, b) => {
    const domainBonus = (node: Target): number => (node.type === 'domain' ? 1000 : 0);
    return domainBonus(b) + (degree.get(b.id) ?? 0) - (domainBonus(a) + (degree.get(a.id) ?? 0));
  });
  return scored[0] ?? null;
};

interface TreeState {
  parentOf: Map<number, number | null>;
  childrenOf: Map<number, number[]>;
  rootId: number;
}

const buildTree = (nodes: Target[], edges: Relation[], rootId: number): TreeState => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adj = undirectedAdj(edges);
  const parentOf = new Map<number, number | null>();
  const childrenOf = new Map<number, number[]>();
  nodes.forEach((node) => childrenOf.set(node.id, []));
  parentOf.set(rootId, null);

  const ringOf = (id: number): number => {
    const node = byId.get(id);
    if (!node) {
      return 9;
    }
    return RING_ORDER[ringForType(node.type, id === rootId)];
  };

  const sortNeighbors = (ids: number[]): number[] =>
    [...ids].sort((a, b) => {
      const nameA = byId.get(a)?.value ?? '';
      const nameB = byId.get(b)?.value ?? '';
      return nameA.localeCompare(nameB);
    });

  const queue = [rootId];
  const seen = new Set<number>([rootId]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    const neighbors = sortNeighbors(adj.get(current) ?? []);
    neighbors.forEach((next) => {
      if (seen.has(next) || !byId.has(next)) {
        return;
      }
      seen.add(next);
      parentOf.set(next, current);
      childrenOf.get(current)?.push(next);
      queue.push(next);
    });
  }

  nodes.forEach((node) => {
    if (seen.has(node.id)) {
      return;
    }
    const inbound = (adj.get(node.id) ?? []).filter((id) => seen.has(id));
    const parent =
      inbound.sort((a, b) => ringOf(a) - ringOf(b))[0] ?? rootId;
    parentOf.set(node.id, parent);
    childrenOf.get(parent)?.push(node.id);
    seen.add(node.id);
  });

  return { parentOf, childrenOf, rootId };
};

const visibleLeafCap = (
  parentId: number,
  leavesMode: LeavesMode,
  localExpanded: Set<number>,
): number => {
  if (leavesMode === 'Expanded' || localExpanded.has(parentId)) {
    return Number.POSITIVE_INFINITY;
  }
  return 3;
};

export const buildRadialLayout = (
  data: GraphData,
  options: {
    cx: number;
    cy: number;
    maxR: number;
    leavesMode: LeavesMode;
    localExpanded: Set<number>;
  },
): { nodes: LaidOutNode[]; links: LaidOutLink[]; rootId: number | null } => {
  const root = pickRoot(data.nodes, data.edges);
  if (!root) {
    return { nodes: [], links: [], rootId: null };
  }

  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const degree = degreeMap(data.edges);
  const tree = buildTree(data.nodes, data.edges, root.id);
  const hidden = new Set<number>();
  const collapsedCount = new Map<number, number>();

  tree.childrenOf.forEach((childIds, parentId) => {
    const leaves = childIds.filter((id) => {
      const node = byId.get(id);
      return node ? LEAF_TYPES.has(node.type) : false;
    });
    const cap = visibleLeafCap(parentId, options.leavesMode, options.localExpanded);
    if (leaves.length <= cap) {
      collapsedCount.set(parentId, 0);
      return;
    }
    const kept = new Set(leaves.slice(0, cap));
    leaves.forEach((id) => {
      if (!kept.has(id)) {
        hidden.add(id);
      }
    });
    collapsedCount.set(parentId, leaves.length - cap);
  });

  const visibleChildren = (id: number): number[] =>
    (tree.childrenOf.get(id) ?? []).filter((childId) => !hidden.has(childId));

  const subtreeWeight = (id: number): number => {
    const kids = visibleChildren(id);
    if (kids.length === 0) {
      return 1;
    }
    return kids.reduce((sum, childId) => sum + subtreeWeight(childId), 0);
  };

  const placed = new Map<number, { theta: number; layoutR: number; x: number; y: number }>();

  const place = (id: number, angle0: number, angle1: number): void => {
    const node = byId.get(id);
    if (!node) {
      return;
    }
    const ring = ringForType(node.type, id === root.id);
    const layoutR = RING_FRACTION[ring] * options.maxR;
    const theta = (angle0 + angle1) / 2;
    placed.set(id, {
      theta,
      layoutR,
      x: options.cx + layoutR * Math.cos(theta),
      y: options.cy + layoutR * Math.sin(theta),
    });
    const kids = visibleChildren(id);
    if (kids.length === 0) {
      return;
    }
    const weights = kids.map((childId) => subtreeWeight(childId));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const span = angle1 - angle0;
    const gap = Math.min(0.01, span / (kids.length * 8 + 1));
    const usable = Math.max(span - gap * kids.length, span * 0.92);
    let cursor = angle0 + (span - usable) / 2;
    kids.forEach((childId, index) => {
      const portion = usable * ((weights[index] ?? 1) / total);
      place(childId, cursor, cursor + portion);
      cursor += portion + gap;
    });
  };

  place(root.id, -Math.PI / 2, (3 * Math.PI) / 2);

  const nodes: LaidOutNode[] = data.nodes
    .filter((node) => !hidden.has(node.id) && placed.has(node.id))
    .map((node) => {
      const pos = placed.get(node.id);
      if (!pos) {
        throw new Error('Missing layout position');
      }
      return {
        id: node.id,
        name: node.value,
        type: node.type,
        ring: ringForType(node.type, node.id === root.id),
        x: pos.x,
        y: pos.y,
        theta: pos.theta,
        layoutR: pos.layoutR,
        parentId: tree.parentOf.get(node.id) ?? null,
        degree: degree.get(node.id) ?? 0,
        collapsedCount: collapsedCount.get(node.id) ?? 0,
        isLeaf: LEAF_TYPES.has(node.type),
      };
    });

  const visibleIds = new Set(nodes.map((node) => node.id));
  const treePairs = new Set<string>();
  nodes.forEach((node) => {
    if (node.parentId === null || !visibleIds.has(node.parentId)) {
      return;
    }
    treePairs.add(`${node.parentId}-${node.id}`);
    treePairs.add(`${node.id}-${node.parentId}`);
  });

  const links: LaidOutLink[] = data.edges
    .filter((edge) => visibleIds.has(edge.source_id) && visibleIds.has(edge.target_id))
    .map((edge) => ({
      sourceId: edge.source_id,
      targetId: edge.target_id,
      tree: treePairs.has(`${edge.source_id}-${edge.target_id}`),
      weight: edge.weight ?? 1,
      confidence: edge.confidence ?? 0,
    }));

  return { nodes, links, rootId: root.id };
};

export const collapsedGraphForForce = (
  data: GraphData,
  leavesMode: LeavesMode,
  localExpanded: Set<number>,
): GraphData => {
  const root = pickRoot(data.nodes, data.edges);
  if (!root || leavesMode === 'Expanded') {
    return data;
  }
  const tree = buildTree(data.nodes, data.edges, root.id);
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const hidden = new Set<number>();
  tree.childrenOf.forEach((childIds, parentId) => {
    if (localExpanded.has(parentId)) {
      return;
    }
    const leaves = childIds.filter((id) => {
      const node = byId.get(id);
      return node ? LEAF_TYPES.has(node.type) : false;
    });
    leaves.slice(3).forEach((id) => hidden.add(id));
  });
  if (hidden.size === 0) {
    return data;
  }
  return {
    nodes: data.nodes.filter((node) => !hidden.has(node.id)),
    edges: data.edges.filter(
      (edge) => !hidden.has(edge.source_id) && !hidden.has(edge.target_id),
    ),
  };
};
