import { ScreenHeader } from '@renderer/components/ScreenHeader';
import { Button, Dot, EmptyState, RefreshIcon, TypeBadge } from '@renderer/components/ui';
import { formatTimestamp, summarizeScan } from '@renderer/lib/reconView';
import type { ReconResult } from '@shared/types';

interface HistoryPageProps {
  history: ReconResult[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClear: () => Promise<void>;
  onGoRecon: () => void;
}

export const HistoryPage = ({
  history,
  loading,
  onRefresh,
  onDelete,
  onClear,
  onGoRecon,
}: HistoryPageProps): JSX.Element => {
  return (
    <section>
      <ScreenHeader
        title="History"
        subtitle="Stored recon results in the local SQLite database."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void onRefresh()} disabled={loading}>
              <RefreshIcon />
              Refresh
            </Button>
            <Button
              variant="danger"
              onClick={() => void onClear()}
              disabled={history.length === 0 || loading}
            >
              Clear all
            </Button>
          </div>
        }
      />

      {history.length === 0 ? (
        <EmptyState
          title="History is empty"
          description="No result stored yet — or the database was cleared. Results appear here as soon as a recon completes."
          action={<Button onClick={onGoRecon}>Go to Recon</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-rt-border bg-rt-surface">
          <div className="grid grid-cols-[1fr_92px_150px_230px_84px] gap-3.5 border-b border-rt-border bg-rt-raised px-[18px] py-2.5 text-[10.5px] font-semibold tracking-[0.07em] text-rt-dim">
            <div>TARGET</div>
            <div>TYPE</div>
            <div>TIMESTAMP</div>
            <div>ARTIFACTS</div>
            <div className="text-right">ACTION</div>
          </div>
          {history.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_92px_150px_230px_84px] items-center gap-3.5 border-b border-rt-divider px-[18px] py-[11px] last:border-b-0 hover:bg-[#0f1a2e]"
            >
              <div className="flex min-w-0 items-center gap-[9px]">
                <Dot type={item.type} size={6} />
                <span className="truncate font-mono text-[12.5px] text-rt-text">{item.target}</span>
              </div>
              <div>
                <TypeBadge type={item.type} />
              </div>
              <div className="text-[11.5px] text-rt-dim tabular">{formatTimestamp(item.createdAt)}</div>
              <div className="text-[11.5px] text-rt-muted">{summarizeScan(item)}</div>
              <div className="text-right">
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-[11px] text-rt-dim"
                  disabled={loading}
                  onClick={() => void onDelete(item.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
