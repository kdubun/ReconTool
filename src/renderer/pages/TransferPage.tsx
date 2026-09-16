import { useEffect, useState } from 'react';
import { ScreenHeader } from '@renderer/components/ScreenHeader';
import {
  Button,
  Card,
  CheckIcon,
  Toast,
  UploadIcon,
  WarnIcon,
} from '@renderer/components/ui';
import type { DataTransferSummary, GraphMetrics } from '@shared/types';

const emptyMetrics: GraphMetrics = {
  nodeCount: 0,
  edgeCount: 0,
  avgConfidence: 0,
  avgWeight: 0,
  topNodeTypes: [],
};

const fileNameFromPath = (filePath: string): string =>
  filePath.split(/[/\\]/).pop() ?? filePath;

export const TransferPage = (): JSX.Element => {
  const [busy, setBusy] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [metrics, setMetrics] = useState<GraphMetrics>(emptyMetrics);
  const [exported, setExported] = useState<{ path: string; summary: DataTransferSummary } | null>(
    null,
  );
  const [imported, setImported] = useState<{ path: string; summary: DataTransferSummary } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const refreshCounts = async (): Promise<void> => {
    try {
      const [history, nextMetrics] = await Promise.all([
        window.api.recon.getHistory(),
        window.api.graph.getMetrics(),
      ]);
      setScanCount(history.length);
      setMetrics(nextMetrics);
    } catch {
      setScanCount(0);
      setMetrics(emptyMetrics);
    }
  };

  useEffect(() => {
    void refreshCounts();
  }, []);

  const handleExport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.data.export();
      setExported(result);
      await refreshCounts();
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.data.import();
      setImported(result);
      setExported(null);
      await refreshCounts();
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const counts = [
    { k: 'Scans', v: String(scanCount) },
    { k: 'Nodes', v: String(metrics.nodeCount) },
    { k: 'Edges', v: String(metrics.edgeCount) },
    { k: 'Artifacts', v: String(imported?.summary.artifacts ?? exported?.summary.artifacts ?? '—') },
  ];

  return (
    <section className="max-w-[900px]">
      <ScreenHeader
        title="Import / Export"
        subtitle="The workspace lives in RAM. Snapshots are the only persistence across sessions."
      />

      <Toast tone="warning" className="mb-3.5" icon={<WarnIcon size={15} stroke="#fbbf24" />}>
        Importing a snapshot <strong className="text-amber-100">replaces</strong> the current
        workspace — {scanCount} scans and {metrics.nodeCount} nodes will be discarded.
      </Toast>

      {error ? (
        <Toast tone="error" className="mb-3.5">
          {error}
        </Toast>
      ) : null}

      <div className="grid grid-cols-2 gap-3.5">
        <Card>
          <div className="text-sm font-semibold text-rt-heading">Export snapshot</div>
          <div className="mt-1 text-xs text-rt-dim">
            Writes a single <span className="font-mono">.recon</span> archive to disk.
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-[9px] rounded-lg border border-rt-border bg-rt-raised p-3">
            {counts.map((row) => (
              <div key={row.k} className="flex justify-between text-[11.5px]">
                <span className="text-rt-dim">{row.k}</span>
                <span className="font-medium text-rt-text tabular">{row.v}</span>
              </div>
            ))}
          </div>
          <Button className="mt-3.5 w-full py-2.5 text-[12.5px]" disabled={busy} onClick={() => void handleExport()}>
            Export snapshot
          </Button>
          {exported ? (
            <div className="mt-3 flex items-center gap-2 rounded-[7px] border border-[rgba(16,185,129,0.28)] bg-[rgba(16,185,129,0.07)] px-[11px] py-2">
              <CheckIcon size={13} stroke="#34d399" />
              <span className="text-[11.5px] text-emerald-200">
                Exported <span className="font-mono">{fileNameFromPath(exported.path)}</span>
              </span>
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="text-sm font-semibold text-rt-heading">Import snapshot</div>
          <div className="mt-1 text-xs text-rt-dim">Loads an archive into the volatile workspace.</div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleImport()}
            className="mt-3.5 w-full rounded-lg border border-dashed border-rt-border-strong bg-rt-raised px-6 py-6 text-center"
          >
            <UploadIcon />
            <div className="mt-2 text-xs text-rt-muted">
              Drop a <span className="font-mono">.recon</span> file here
            </div>
            <div className="mt-1 text-[11px] text-rt-faint">or browse the filesystem</div>
          </button>
          <Button
            variant="secondary"
            className="mt-3.5 w-full py-2.5 text-[12.5px] font-semibold"
            disabled={busy}
            onClick={() => void handleImport()}
          >
            Choose file…
          </Button>
          <div className="mt-3 flex items-center gap-2 rounded-[7px] border border-rt-border bg-rt-raised px-[11px] py-2">
            <span className="text-[11.5px] text-rt-dim">
              {imported
                ? `Last import — ${fileNameFromPath(imported.path)} · ${imported.summary.reconResults} scans restored`
                : 'No import in this session'}
            </span>
          </div>
        </Card>
      </div>
    </section>
  );
};
