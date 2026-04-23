import { dialog, ipcMain } from 'electron';
import {
  exportWorkspaceSnapshot,
  importWorkspaceSnapshot,
} from '@main/services/data-transfer.service';
import {
  deleteNodeFromGraph,
  focusGraph,
  getGraph,
  getGraphMetrics,
  getNodeDetails,
} from '@main/services/graph.service';
import {
  analyzeScanWithAiAssistant,
  clearHistory,
  deleteScanById,
  getStoredEnrichmentSettings,
  getHistory,
  scanTarget,
  syncGraphFromHistory,
  updateEnrichmentSettings,
} from '@main/services/recon.service';
import type { IpcChannels, TargetType } from '@shared/types';

const isTargetType = (value: string): value is TargetType =>
  value === 'domain' || value === 'ip' || value === 'email';

const validateScanPayload = (
  payload: IpcChannels['recon:scan']['request'],
): void => {
  if (!payload.target.trim()) {
    throw new Error('Target is required');
  }
  if (!isTargetType(payload.type)) {
    throw new Error('Invalid target type');
  }
};

export const registerIpcHandlers = (): void => {
  ipcMain.handle(
    'recon:scan',
    async (_event, request: IpcChannels['recon:scan']['request']) => {
      validateScanPayload(request);
      return scanTarget(request.target.trim(), request.type);
    },
  );

  ipcMain.handle('recon:getHistory', async () => getHistory());
  ipcMain.handle(
    'recon:delete',
    async (_event, request: IpcChannels['recon:delete']['request']) => {
      if (!Number.isInteger(request.id) || request.id <= 0) {
        throw new Error('Invalid scan id');
      }
      return { success: deleteScanById(request.id) };
    },
  );
  ipcMain.handle('recon:clearHistory', async () => ({
    deleted: clearHistory(),
  }));
  ipcMain.handle('graph:get', async () => {
    syncGraphFromHistory();
    return getGraph();
  });
  ipcMain.handle(
    'graph:getFiltered',
    async (_event, request: IpcChannels['graph:getFiltered']['request']) => {
      syncGraphFromHistory();
      return getGraph(request);
    },
  );
  ipcMain.handle('graph:getMetrics', async () => {
    syncGraphFromHistory();
    return getGraphMetrics();
  });
  ipcMain.handle(
    'graph:getNodeDetails',
    async (_event, request: IpcChannels['graph:getNodeDetails']['request']) => {
      if (!Number.isInteger(request.nodeId) || request.nodeId <= 0) {
        throw new Error('Invalid node id');
      }
      return getNodeDetails(request.nodeId);
    },
  );
  ipcMain.handle(
    'graph:focus',
    async (_event, request: IpcChannels['graph:focus']['request']) => {
      if (!Number.isInteger(request.nodeId) || request.nodeId <= 0) {
        throw new Error('Invalid node id');
      }
      if (request.hops !== 1 && request.hops !== 2) {
        throw new Error('Invalid hops');
      }
      return focusGraph(request.nodeId, request.hops);
    },
  );
  ipcMain.handle(
    'graph:deleteNode',
    async (_event, request: IpcChannels['graph:deleteNode']['request']) => {
      if (!Number.isInteger(request.nodeId) || request.nodeId <= 0) {
        throw new Error('Invalid node id');
      }
      return deleteNodeFromGraph(request.nodeId, request.deleteUniqueNeighbors);
    },
  );
  ipcMain.handle('settings:getEnrichment', async () => getStoredEnrichmentSettings());
  ipcMain.handle(
    'settings:setEnrichment',
    async (_event, request: IpcChannels['settings:setEnrichment']['request']) =>
      updateEnrichmentSettings(request),
  );
  ipcMain.handle(
    'ai:analyzeScan',
    async (_event, request: IpcChannels['ai:analyzeScan']['request']) => {
      if (!Number.isInteger(request.scanId) || request.scanId <= 0) {
        throw new Error('Invalid scan id');
      }
      return analyzeScanWithAiAssistant(request.scanId);
    },
  );
  ipcMain.handle('data:export', async () => {
    const picked = await dialog.showSaveDialog({
      title: 'Export workspace snapshot',
      defaultPath: 'recontool-snapshot.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (picked.canceled || !picked.filePath) {
      throw new Error('Export cancelled');
    }
    const summary = await exportWorkspaceSnapshot(picked.filePath);
    return { path: picked.filePath, summary };
  });
  ipcMain.handle('data:import', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Import workspace snapshot',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      throw new Error('Import cancelled');
    }
    const filePath = picked.filePaths[0];
    const summary = await importWorkspaceSnapshot(filePath);
    return { path: filePath, summary };
  });
};
