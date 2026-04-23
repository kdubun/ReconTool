import { useState } from 'react';

type TransferSummary = {
  reconResults: number;
  targets: number;
  relations: number;
  artifacts: number;
  attributes: number;
};

export const TransferPage = (): JSX.Element => {
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatSummary = (summary: TransferSummary): string =>
    `recon=${summary.reconResults}, targets=${summary.targets}, relations=${summary.relations}, artifacts=${summary.artifacts}, attributes=${summary.attributes}`;

  const handleExport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.api.data.export();
      setMessage(`Exported to ${result.path} (${formatSummary(result.summary)})`);
    } catch (eventError) {
      const messageText =
        eventError instanceof Error ? eventError.message : 'Export failed';
      setError(messageText);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.api.data.import();
      setMessage(`Imported from ${result.path} (${formatSummary(result.summary)})`);
    } catch (eventError) {
      const messageText =
        eventError instanceof Error ? eventError.message : 'Import failed';
      setError(messageText);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-slate-100">Import / Export</h2>
        <p className="text-sm text-slate-400">
          Workspace is volatile (RAM only). Use export/import to continue later.
        </p>
      </header>

      <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleExport()}
            className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Export snapshot
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleImport()}
            className="rounded-md bg-violet-700 px-3 py-2 text-sm text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Import snapshot
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Import replaces current in-memory data. No local database file is kept after app exit.
        </p>
      </section>

      {message ? (
        <div className="rounded-md border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-300">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}
    </section>
  );
};
