import { useEffect, useRef, useState } from 'react';
import { ResultCard } from '@renderer/components/ResultCard';
import { ScreenHeader } from '@renderer/components/ScreenHeader';
import { TargetForm } from '@renderer/components/TargetForm';
import { AlertIcon, Button, Spinner, Toast } from '@renderer/components/ui';
import { cx } from '@renderer/lib/cx';
import type { ReconResult, TargetType } from '@shared/types';

interface ReconPageProps {
  loading: boolean;
  error: string | null;
  latestResult: ReconResult | null;
  onScan: (payload: { target: string; type: TargetType }) => Promise<void>;
  onOpenInGraph: () => void;
}

const SCAN_STEPS = [
  'DNS records',
  'WHOIS',
  'Reverse DNS',
  'TLS handshake',
  'HTTP headers',
  'Mail posture',
  'Live modules',
];

type StepState = 'done' | 'run' | 'wait';

const stepState = (index: number, elapsed: number): StepState => {
  const cursor = Math.min(SCAN_STEPS.length - 1, Math.floor(elapsed / 1.4));
  if (index < cursor) {
    return 'done';
  }
  if (index === cursor) {
    return 'run';
  }
  return 'wait';
};

export const ReconPage = ({
  loading,
  error,
  latestResult,
  onScan,
  onOpenInGraph,
}: ReconPageProps): JSX.Element => {
  const [elapsed, setElapsed] = useState(0);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const lastPayload = useRef<{ target: string; type: TargetType } | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!loading) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    startedAt.current = Date.now();
    const timer = window.setInterval(() => {
      if (startedAt.current) {
        setElapsed((Date.now() - startedAt.current) / 1000);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    setDismissedError(null);
  }, [error]);

  const handleScan = async (payload: { target: string; type: TargetType }): Promise<void> => {
    lastPayload.current = payload;
    await onScan(payload);
  };

  const showError = error && dismissedError !== error;
  const scanningTarget = lastPayload.current?.target ?? 'target';

  return (
    <section className="max-w-[1000px]">
      <ScreenHeader
        title="Recon"
        subtitle="Scan domains, IPs, emails or ranges — offline-first, live modules optional."
      />

      <TargetForm loading={loading} onSubmit={handleScan} />

      {loading ? (
        <div className="mt-3.5 overflow-hidden rounded-[10px] border border-rt-border bg-rt-surface">
          <div className="h-0.5 overflow-hidden bg-rt-raised">
            <div className="h-full w-1/4 bg-rt-accent animate-rt-bar" />
          </div>
          <div className="p-[18px]">
            <div className="flex items-center gap-2.5">
              <Spinner />
              <span className="text-[13.5px] font-semibold text-rt-heading">
                Scanning {scanningTarget}…
              </span>
              <span className="text-[11.5px] text-rt-dim">
                step {Math.min(SCAN_STEPS.length, Math.floor(elapsed / 1.4) + 1)} / {SCAN_STEPS.length} ·{' '}
                {elapsed.toFixed(1)}s elapsed
              </span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {SCAN_STEPS.map((label, index) => {
                const state = stepState(index, elapsed);
                return (
                  <div
                    key={label}
                    className={cx(
                      'flex items-center gap-2 rounded-[7px] px-2.5 py-2 text-[11.5px]',
                      state === 'done' &&
                        'border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.07)] text-emerald-200',
                      state === 'run' &&
                        'border border-[rgba(2,132,199,0.4)] bg-[rgba(2,132,199,0.1)] text-sky-200',
                      state === 'wait' && 'border border-rt-border bg-rt-raised text-rt-faint',
                    )}
                  >
                    <span
                      className={cx(
                        'block h-1.5 w-1.5 shrink-0 rounded-full',
                        state === 'done' && 'bg-rt-success',
                        state === 'run' && 'bg-rt-accent-light animate-rt-pulse',
                        state === 'wait' && 'bg-rt-border-strong',
                      )}
                    />
                    <span className="flex-1">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showError ? (
        <Toast
          tone="error"
          className="mt-3.5 items-start"
          icon={<AlertIcon size={15} stroke="#fb7185" />}
          action={
            <button
              type="button"
              className="bg-transparent p-0 text-sm leading-none text-rose-400"
              onClick={() => setDismissedError(error)}
            >
              ×
            </button>
          }
        >
          <div className="text-[13px] font-semibold text-rose-200">Recon failed</div>
          <div className="mt-1 font-mono text-xs text-rose-300/85">{error}</div>
          <div className="mt-[11px] flex gap-2">
            <Button
              className="rounded-md bg-rt-error px-3 py-1.5 text-[11.5px] hover:bg-rose-700"
              disabled={!lastPayload.current}
              onClick={() => {
                if (lastPayload.current) {
                  void handleScan(lastPayload.current);
                }
              }}
            >
              Retry scan
            </Button>
            {latestResult ? (
              <Button variant="danger" className="rounded-md px-3 py-1.5 text-[11.5px]" onClick={() => setDismissedError(error)}>
                Keep partial result
              </Button>
            ) : null}
          </div>
        </Toast>
      ) : null}

      {latestResult && !loading ? (
        <ResultCard result={latestResult} onOpenInGraph={onOpenInGraph} />
      ) : null}
    </section>
  );
};
