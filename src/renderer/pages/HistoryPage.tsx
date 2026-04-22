import type { ReconResult } from '@shared/types';

interface HistoryPageProps {
  history: ReconResult[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClear: () => Promise<void>;
}

export const HistoryPage = ({
  history,
  loading,
  onRefresh,
  onDelete,
  onClear,
}: HistoryPageProps): JSX.Element => {
  const summarizeArtifacts = (item: ReconResult): string => {
    const dnsCount =
      item.dns && typeof item.dns === 'object'
        ? Object.values(item.dns as Record<string, unknown>).reduce<number>(
            (total, value) =>
              total + (Array.isArray(value) ? value.length : 0),
            0,
          )
        : 0;
    const whoisString = JSON.stringify(item.whois ?? {});
    const emailCount = (whoisString.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
      .length;
    return `${dnsCount} dns artifacts | ${emailCount} whois emails`;
  };

  return (
    <section className="space-y-6">
    <header className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-slate-100">History</h2>
        <p className="text-sm text-slate-400">Stored recon results in local SQLite database.</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void onClear()}
          disabled={history.length === 0 || loading}
          className="rounded-md bg-rose-700 px-3 py-2 text-sm text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          Clear all
        </button>
      </div>
    </header>

    <div className="space-y-3">
      {loading && history.length === 0 ? (
        <p className="text-sm text-slate-400">Loading history...</p>
      ) : null}
      {history.length === 0 ? (
        <div className="rounded-md border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
          No scans available.
        </div>
      ) : (
        history.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-slate-700 bg-slate-900 p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base text-slate-100">{item.target}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase text-slate-400">{item.type}</span>
                <button
                  type="button"
                  onClick={() => void onDelete(item.id)}
                  disabled={loading}
                  className="rounded-md bg-rose-700 px-2 py-1 text-xs text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(item.createdAt).toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">{summarizeArtifacts(item)}</p>
          </article>
        ))
      )}
    </div>
  </section>
  );
};
