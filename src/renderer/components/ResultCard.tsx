import { Button, TypeBadge } from '@renderer/components/ui';
import {
  dnsRowsFromResult,
  formatTimestamp,
  headerRowsFromResult,
  mailRowsFromResult,
  summarizeScan,
  tlsRowsFromResult,
  whoisRowsFromResult,
  type MailStatus,
} from '@renderer/lib/reconView';
import type { ReconResult } from '@shared/types';

interface ResultCardProps {
  result: ReconResult;
  onOpenInGraph?: () => void;
}

const mailBadge: Record<MailStatus, string> = {
  pass: 'text-emerald-400 bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.35)]',
  partial: 'text-amber-400 bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.35)]',
  weak: 'text-rose-400 bg-[rgba(225,29,72,0.12)] border-[rgba(225,29,72,0.35)]',
  missing: 'text-rt-dim bg-rt-raised border-rt-border',
};

const KvRow = ({
  label,
  value,
  accent,
  wide,
}: {
  label: string;
  value: string;
  accent?: boolean;
  wide?: boolean;
}): JSX.Element => (
  <div className="flex gap-3 border-b border-rt-divider py-[5px]">
    <span
      className={
        accent
          ? 'w-[46px] shrink-0 font-mono text-[11px] font-semibold text-rt-accent-light'
          : 'w-[88px] shrink-0 text-[11px] text-rt-dim'
      }
    >
      {label}
    </span>
    <span className={`min-w-0 flex-1 break-all font-mono text-slate-300 ${wide ? 'text-[11.5px]' : 'text-xs'}`}>
      {value}
    </span>
  </div>
);

export const ResultCard = ({ result, onOpenInGraph }: ResultCardProps): JSX.Element => {
  const dnsRows = dnsRowsFromResult(result.dns);
  const whoisRows = whoisRowsFromResult(result.whois);
  const mailRows = mailRowsFromResult(result.dns);
  const tlsRows = tlsRowsFromResult(result.headers);
  const headerRows = headerRowsFromResult(result.headers);

  return (
    <article className="mt-3.5 overflow-hidden rounded-[10px] border border-rt-border bg-rt-surface">
      <div className="flex items-center gap-2.5 border-b border-rt-border px-[18px] py-3.5">
        <span className="font-mono text-[15px] font-semibold text-rt-strong">{result.target}</span>
        <TypeBadge type={result.type} />
        <span className="text-[11.5px] text-rt-dim">
          {formatTimestamp(result.createdAt)} · {summarizeScan(result)}
        </span>
        <div className="flex-1" />
        {onOpenInGraph ? (
          <Button variant="secondary" className="rounded-md px-[11px] py-1.5 text-[11.5px]" onClick={onOpenInGraph}>
            Open in graph
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-px bg-rt-border">
        <section className="bg-rt-surface px-[18px] py-4">
          <div className="mb-2.5 text-[11px] font-semibold tracking-[0.07em] text-rt-dim">DNS</div>
          {dnsRows.length === 0 ? (
            <p className="text-[12px] text-rt-faint">No DNS artifacts.</p>
          ) : (
            dnsRows.map((row) => <KvRow key={row.k} label={row.k} value={row.v} accent />)
          )}
        </section>
        <section className="bg-rt-surface px-[18px] py-4">
          <div className="mb-2.5 text-[11px] font-semibold tracking-[0.07em] text-rt-dim">WHOIS</div>
          {whoisRows.length === 0 ? (
            <p className="text-[12px] text-rt-faint">No WHOIS data.</p>
          ) : (
            whoisRows.map((row) => <KvRow key={row.k} label={row.k} value={row.v} />)
          )}
        </section>
        <section className="bg-rt-surface px-[18px] py-4">
          <div className="mb-2.5 text-[11px] font-semibold tracking-[0.07em] text-rt-dim">
            MAIL POSTURE
          </div>
          <div className="flex flex-col gap-2">
            {mailRows.map((row) => (
              <div
                key={row.k}
                className="flex items-center gap-2.5 rounded-[7px] border border-rt-border bg-rt-raised px-[11px] py-2"
              >
                <span className="w-11 text-[11px] font-bold tracking-[0.04em] text-rt-muted">{row.k}</span>
                <span className={`rounded-[5px] border px-[7px] py-0.5 text-[10px] font-semibold ${mailBadge[row.status]}`}>
                  {row.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-rt-dim">{row.v}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="bg-rt-surface px-[18px] py-4">
          <div className="mb-2.5 text-[11px] font-semibold tracking-[0.07em] text-rt-dim">
            TLS CERTIFICATE
          </div>
          {tlsRows.length === 0 ? (
            <p className="text-[12px] text-rt-faint">No TLS certificate captured.</p>
          ) : (
            tlsRows.map((row) => <KvRow key={row.k} label={row.k} value={row.v} />)
          )}
        </section>
        <section className="col-span-2 bg-rt-surface px-[18px] py-4">
          <div className="mb-2.5 text-[11px] font-semibold tracking-[0.07em] text-rt-dim">
            HTTP HEADERS
          </div>
          {headerRows.length === 0 ? (
            <p className="text-[12px] text-rt-faint">No HTTP headers.</p>
          ) : (
            <div className="grid grid-cols-3 gap-x-[18px] gap-y-1.5">
              {headerRows.map((row) => (
                <div key={row.k} className="flex gap-2.5 border-b border-rt-divider py-1">
                  <span className="whitespace-nowrap text-[11px] text-rt-dim">{row.k}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-slate-300">
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </article>
  );
};
