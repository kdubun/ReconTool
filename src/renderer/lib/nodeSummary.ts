import { ringForType } from '@renderer/lib/radialLayout';
import { formatTimestamp } from '@renderer/lib/reconView';
import type { GraphData, GraphNodeType, Relation, Target } from '@shared/types';

const TYPE_LABEL: Record<GraphNodeType, string> = {
  domain: 'Domain',
  ip: 'IP address',
  email: 'Email',
  subdomain: 'Subdomain',
  asn: 'ASN',
  org: 'Organisation',
  nameserver: 'Nameserver',
  mx: 'Mail exchanger',
  url: 'URL',
  cidr: 'CIDR',
  registrar: 'Registrar',
  phone: 'Phone',
  country: 'Country',
  city: 'City',
  tech: 'Technology',
  port: 'Port',
  service: 'Service',
  certificate: 'Certificate',
  tls_issuer: 'TLS issuer',
  spf: 'SPF',
  dmarc: 'DMARC',
  dkim: 'DKIM',
  os: 'OS',
};

const RING_BLURB: Record<string, string> = {
  center: 'It sits at the centre of the graph.',
  identity: 'It lives on the identity ring (DNS / mail / people).',
  hosts: 'It lives on the hosts ring (addresses and certificates).',
  infra: 'It lives on the infrastructure ring (ASN, org, CIDR).',
  leaf: 'It is a leaf artefact (port, service, OS or URL).',
};

export interface NeighborTypeCount {
  type: GraphNodeType;
  count: number;
}

export interface NodeSummary {
  sentence: string;
  neighborTypes: NeighborTypeCount[];
  relationTypes: Array<{ type: string; count: number }>;
  avgConfidence: number;
  avgWeight: number;
  seen: string | null;
}

const localEdges = (graph: GraphData, nodeId: number): Relation[] =>
  graph.edges.filter((edge) => edge.source_id === nodeId || edge.target_id === nodeId);

export const buildNodeSummary = (
  node: Target,
  graph: GraphData,
  edges: Relation[],
  isRoot = false,
): NodeSummary => {
  const byId = new Map(graph.nodes.map((item) => [item.id, item]));
  const typeCounts = new Map<GraphNodeType, number>();
  const relationCounts = new Map<string, number>();

  edges.forEach((edge) => {
    relationCounts.set(edge.type, (relationCounts.get(edge.type) ?? 0) + 1);
    const neighborId = edge.source_id === node.id ? edge.target_id : edge.source_id;
    const neighbor = byId.get(neighborId);
    if (!neighbor) {
      return;
    }
    typeCounts.set(neighbor.type, (typeCounts.get(neighbor.type) ?? 0) + 1);
  });

  const neighborTypes = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const relationTypes = [...relationCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const avgConfidence =
    edges.length === 0
      ? 0
      : edges.reduce((sum, edge) => sum + (edge.confidence ?? 0), 0) / edges.length;
  const avgWeight =
    edges.length === 0
      ? 0
      : edges.reduce((sum, edge) => sum + (edge.weight ?? 1), 0) / edges.length;

  const label = TYPE_LABEL[node.type] ?? node.type;
  const degree = edges.length;
  const mix = neighborTypes
    .slice(0, 3)
    .map((entry) => `${entry.count} ${entry.type}`)
    .join(', ');
  const topRelation = relationTypes[0]?.type;
  const ring = RING_BLURB[ringForType(node.type, isRoot)] ?? '';
  const seenAt = node.lastSeen ?? node.firstSeen ?? null;
  const seenLabel = seenAt ? formatTimestamp(seenAt) : null;

  const parts: string[] = [];
  if (degree === 0) {
    parts.push(`${label} with no recorded graph relations yet.`);
  } else {
    parts.push(
      `${label} with ${degree} neighbour${degree === 1 ? '' : 's'}${mix ? ` — ${mix}` : ''}.`,
    );
    if (topRelation) {
      parts.push(`Most common link: ${topRelation}.`);
    }
  }
  if (ring) {
    parts.push(ring);
  }
  if (typeof node.riskScore === 'number' && node.riskScore > 0) {
    parts.push(`Risk score ${node.riskScore.toFixed(1)}.`);
  }

  return {
    sentence: parts.join(' '),
    neighborTypes,
    relationTypes,
    avgConfidence,
    avgWeight,
    seen: seenLabel,
  };
};

export const edgesForNode = (
  nodeId: number,
  graph: GraphData,
  detailsEdges: Relation[] | undefined,
): Relation[] => {
  if (detailsEdges && detailsEdges.length > 0) {
    return detailsEdges;
  }
  return localEdges(graph, nodeId);
};
