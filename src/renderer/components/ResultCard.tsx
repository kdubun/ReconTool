import type { ReconResult } from '@shared/types';

interface ResultCardProps {
  result: ReconResult;
}

export const ResultCard = ({ result }: ResultCardProps): JSX.Element => (
  <article className="rounded-lg border border-slate-700 bg-slate-900 p-5">
    <header className="mb-4 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">{result.type}</p>
        <h3 className="text-lg font-semibold text-slate-100">{result.target}</h3>
      </div>
      <time className="text-xs text-slate-500">{new Date(result.createdAt).toLocaleString()}</time>
    </header>

    <div className="space-y-4 text-sm">
      <section>
        <h4 className="mb-1 font-medium text-slate-300">DNS</h4>
        <pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-200">
          {JSON.stringify(result.dns ?? null, null, 2)}
        </pre>
      </section>
      <section>
        <h4 className="mb-1 font-medium text-slate-300">WHOIS</h4>
        <pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-200">
          {JSON.stringify(result.whois ?? null, null, 2)}
        </pre>
      </section>
      <section>
        <h4 className="mb-1 font-medium text-slate-300">HTTP Headers</h4>
        <pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-200">
          {JSON.stringify(result.headers ?? null, null, 2)}
        </pre>
      </section>
    </div>
  </article>
);
