import { contextBridge, ipcRenderer } from 'electron';
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

const api = {
  recon: {
    scan: (payload: ReconScanRequest): Promise<ReconScanResponse> =>
      ipcRenderer.invoke('recon:scan', payload),
    getHistory: (): Promise<ReconHistoryResponse> =>
      ipcRenderer.invoke('recon:getHistory'),
    delete: (payload: ReconDeleteRequest): Promise<ReconDeleteResponse> =>
      ipcRenderer.invoke('recon:delete', payload),
    clearHistory: (): Promise<ReconClearHistoryResponse> =>
      ipcRenderer.invoke('recon:clearHistory'),
  },
  graph: {
    get: (): Promise<GraphData> => ipcRenderer.invoke('graph:get'),
    getFiltered: (payload: GraphFiltersRequest): Promise<GraphData> =>
      ipcRenderer.invoke('graph:getFiltered', payload),
    getMetrics: (): Promise<GraphMetricsResponse> => ipcRenderer.invoke('graph:getMetrics'),
    getNodeDetails: (
      payload: GraphNodeDetailsRequest,
    ): Promise<GraphNodeDetailsResponse> => ipcRenderer.invoke('graph:getNodeDetails', payload),
    focus: (payload: GraphFocusRequest): Promise<GraphData> =>
      ipcRenderer.invoke('graph:focus', payload),
    deleteNode: (payload: GraphDeleteNodeRequest): Promise<GraphDeleteNodeResponse> =>
      ipcRenderer.invoke('graph:deleteNode', payload),
  },
  settings: {
    getEnrichment: (): Promise<EnrichmentSettingsResponse> =>
      ipcRenderer.invoke('settings:getEnrichment'),
    setEnrichment: (
      payload: EnrichmentSettingsUpdateRequest,
    ): Promise<EnrichmentSettingsResponse> => ipcRenderer.invoke('settings:setEnrichment', payload),
  },
  ai: {
    analyzeScan: (payload: AiAnalyzeScanRequest): Promise<AiAnalyzeScanResponse> =>
      ipcRenderer.invoke('ai:analyzeScan', payload),
  },
  data: {
    export: (): Promise<DataExportResponse> => ipcRenderer.invoke('data:export'),
    import: (): Promise<DataImportResponse> => ipcRenderer.invoke('data:import'),
  },
};

contextBridge.exposeInMainWorld('api', api);
