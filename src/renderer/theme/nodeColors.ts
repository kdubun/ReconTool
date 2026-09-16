import type { GraphNodeType } from '@shared/types';

export const NODE_COLORS: Record<GraphNodeType, string> = {
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

export const LEGEND_NODE_TYPES: GraphNodeType[] = [
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
  'certificate',
  'port',
  'service',
  'os',
];

export const nodeColor = (type: string): string =>
  NODE_COLORS[type as GraphNodeType] ?? '#64748b';
