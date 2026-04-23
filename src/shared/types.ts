export type TargetType = 'domain' | 'ip' | 'email';
export type GraphNodeType =
  | TargetType
  | 'subdomain'
  | 'asn'
  | 'org'
  | 'nameserver'
  | 'mx'
  | 'url'
  | 'cidr'
  | 'registrar'
  | 'phone'
  | 'country'
  | 'city'
  | 'tech';

export type GraphSourceType = 'passive' | 'live' | 'manual';

export interface ReconResult {
  id: number;
  target: string;
  type: TargetType;
  dns?: unknown;
  whois?: unknown;
  headers?: unknown;
  createdAt: string;
}

export interface Target {
  id: number;
  value: string;
  type: GraphNodeType;
  category?: string;
  displayName?: string;
  firstSeen?: string;
  lastSeen?: string;
  tags?: string[];
  riskScore?: number;
}

export interface Relation {
  id: number;
  source_id: number;
  target_id: number;
  type: string;
  weight?: number;
  confidence?: number;
  firstSeen?: string;
  lastSeen?: string;
  source?: GraphSourceType;
  scanId?: number | null;
  evidence?: string[];
}

export interface GraphData {
  nodes: Target[];
  edges: Relation[];
}

export interface GraphFilters {
  query?: string;
  nodeTypes?: GraphNodeType[];
  minConfidence?: number;
  source?: GraphSourceType | 'all';
  fromDate?: string;
  toDate?: string;
}

export interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  avgConfidence: number;
  avgWeight: number;
  topNodeTypes: Array<{ type: GraphNodeType; count: number }>;
}

export interface GraphNodeDetails {
  node: Target;
  neighbors: Target[];
  edges: Relation[];
}

export interface DeleteGraphNodeRequest {
  nodeId: number;
  deleteUniqueNeighbors: boolean;
}

export interface DeleteGraphNodeResponse {
  deletedNodeIds: number[];
  deletedRelationCount: number;
}

export interface EnrichmentSettings {
  liveEnrichmentEnabled: boolean;
  geoEnrichmentEnabled: boolean;
  techEnrichmentEnabled: boolean;
  aiAssistantEnabled: boolean;
  aiApiKey: string;
  updatedAt: string;
}

export interface AiScanAnalysis {
  scanId: number;
  analysis: string;
  model: string;
  generatedAt: string;
}

export type IpcChannels = {
  'recon:scan': {
    request: { target: string; type: TargetType };
    response: ReconResult;
  };
  'recon:getHistory': {
    request: void;
    response: ReconResult[];
  };
  'recon:delete': {
    request: { id: number };
    response: { success: boolean };
  };
  'recon:clearHistory': {
    request: void;
    response: { deleted: number };
  };
  'graph:get': {
    request: void;
    response: GraphData;
  };
  'graph:getFiltered': {
    request: GraphFilters;
    response: GraphData;
  };
  'graph:getMetrics': {
    request: void;
    response: GraphMetrics;
  };
  'graph:getNodeDetails': {
    request: { nodeId: number };
    response: GraphNodeDetails | null;
  };
  'graph:focus': {
    request: { nodeId: number; hops: 1 | 2 };
    response: GraphData;
  };
  'graph:deleteNode': {
    request: DeleteGraphNodeRequest;
    response: DeleteGraphNodeResponse;
  };
  'settings:getEnrichment': {
    request: void;
    response: EnrichmentSettings;
  };
  'settings:setEnrichment': {
    request: Partial<EnrichmentSettings>;
    response: EnrichmentSettings;
  };
  'ai:analyzeScan': {
    request: { scanId: number };
    response: AiScanAnalysis;
  };
};
