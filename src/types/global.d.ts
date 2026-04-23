import type { GraphData, IpcChannels } from '@shared/types';

type ReconScanRequest = IpcChannels['recon:scan']['request'];
type ReconScanResponse = IpcChannels['recon:scan']['response'];
type ReconHistoryResponse = IpcChannels['recon:getHistory']['response'];
type ReconDeleteRequest = IpcChannels['recon:delete']['request'];
type ReconDeleteResponse = IpcChannels['recon:delete']['response'];
type ReconClearHistoryResponse = IpcChannels['recon:clearHistory']['response'];
type GraphDeleteNodeRequest = IpcChannels['graph:deleteNode']['request'];
type GraphDeleteNodeResponse = IpcChannels['graph:deleteNode']['response'];
type GraphFiltersRequest = IpcChannels['graph:getFiltered']['request'];
type GraphMetricsResponse = IpcChannels['graph:getMetrics']['response'];
type GraphNodeDetailsRequest = IpcChannels['graph:getNodeDetails']['request'];
type GraphNodeDetailsResponse = IpcChannels['graph:getNodeDetails']['response'];
type GraphFocusRequest = IpcChannels['graph:focus']['request'];
type EnrichmentSettingsResponse = IpcChannels['settings:getEnrichment']['response'];
type EnrichmentSettingsUpdateRequest = IpcChannels['settings:setEnrichment']['request'];
type AiAnalyzeScanRequest = IpcChannels['ai:analyzeScan']['request'];
type AiAnalyzeScanResponse = IpcChannels['ai:analyzeScan']['response'];
type DataExportResponse = IpcChannels['data:export']['response'];
type DataImportResponse = IpcChannels['data:import']['response'];

declare global {
  interface Window {
    api: {
      recon: {
        scan: (payload: ReconScanRequest) => Promise<ReconScanResponse>;
        getHistory: () => Promise<ReconHistoryResponse>;
        delete: (payload: ReconDeleteRequest) => Promise<ReconDeleteResponse>;
        clearHistory: () => Promise<ReconClearHistoryResponse>;
      };
      graph: {
        get: () => Promise<GraphData>;
        getFiltered: (payload: GraphFiltersRequest) => Promise<GraphData>;
        getMetrics: () => Promise<GraphMetricsResponse>;
        getNodeDetails: (
          payload: GraphNodeDetailsRequest,
        ) => Promise<GraphNodeDetailsResponse>;
        focus: (payload: GraphFocusRequest) => Promise<GraphData>;
        deleteNode: (payload: GraphDeleteNodeRequest) => Promise<GraphDeleteNodeResponse>;
      };
      settings: {
        getEnrichment: () => Promise<EnrichmentSettingsResponse>;
        setEnrichment: (
          payload: EnrichmentSettingsUpdateRequest,
        ) => Promise<EnrichmentSettingsResponse>;
      };
      ai: {
        analyzeScan: (payload: AiAnalyzeScanRequest) => Promise<AiAnalyzeScanResponse>;
      };
      data: {
        export: () => Promise<DataExportResponse>;
        import: () => Promise<DataImportResponse>;
      };
    };
  }
}

export {};
