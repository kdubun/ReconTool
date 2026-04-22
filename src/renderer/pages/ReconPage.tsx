import { ResultCard } from '@renderer/components/ResultCard';
import { TargetForm } from '@renderer/components/TargetForm';
import type { ReconResult, TargetType } from '@shared/types';

interface ReconPageProps {
  loading: boolean;
  error: string | null;
  latestResult: ReconResult | null;
  onScan: (payload: { target: string; type: TargetType }) => Promise<void>;
}

export const ReconPage = ({
  loading,
  error,
  latestResult,
  onScan,
}: ReconPageProps): JSX.Element => (
  <section className="space-y-6">
    <header>
      <h2 className="text-2xl font-semibold text-slate-100">Recon</h2>
      <p className="text-sm text-slate-400">Scan domains, IPs, or emails offline-first.</p>
    </header>

    <TargetForm loading={loading} onSubmit={onScan} />

    {error ? (
      <div className="rounded-md border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-300">
        {error}
      </div>
    ) : null}

    {latestResult ? <ResultCard result={latestResult} /> : null}
  </section>
);
