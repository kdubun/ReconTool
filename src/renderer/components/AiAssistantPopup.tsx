import { useState, type FormEvent } from 'react';
import { Button, Input, Spinner } from '@renderer/components/ui';
import type { AiScanAnalysis } from '@shared/types';

interface AiAssistantPopupProps {
  assistantEnabled: boolean;
  hasApiKey: boolean;
  loading: boolean;
  latestTarget: string | null;
  analysis: AiScanAnalysis | null;
  error: string | null;
  onClose: () => void;
  onSend?: (() => void) | undefined;
}

export const AiAssistantPopup = ({
  assistantEnabled,
  hasApiKey,
  loading,
  latestTarget,
  analysis,
  error,
  onClose,
  onSend,
}: AiAssistantPopupProps): JSX.Element => {
  const [draft, setDraft] = useState('');

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    onSend?.();
    setDraft('');
  };

  return (
    <aside className="fixed bottom-5 right-[22px] z-40 w-[380px] overflow-hidden rounded-xl border border-rt-border-strong bg-rt-surface text-rt-text shadow-ai">
      <div className="flex items-center gap-[9px] border-b border-rt-border bg-rt-raised px-3.5 py-3">
        <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[rgba(139,92,246,0.4)] bg-[rgba(139,92,246,0.18)] text-[10px] text-violet-300">
          AI
        </span>
        <span className="text-[12.5px] font-semibold text-rt-heading">Assistant</span>
        <span className="text-[10.5px] text-rt-dim">{analysis?.model ?? 'local model'}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="bg-transparent p-0 text-[15px] leading-none text-rt-dim"
        >
          −
        </button>
      </div>

      <div className="flex max-h-[250px] flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
        {!assistantEnabled ? (
          <div className="rounded-[9px] border border-rt-border bg-rt-raised px-[11px] py-2 text-xs leading-normal text-slate-300">
            AI assistant is disabled. Enable it in Parametre to analyse each new scan.
          </div>
        ) : null}
        {assistantEnabled && !hasApiKey ? (
          <div className="rounded-[9px] border border-[rgba(245,158,11,0.32)] bg-[rgba(245,158,11,0.08)] px-[11px] py-2 text-xs text-amber-200">
            Add your API key in Parametre to activate analysis.
          </div>
        ) : null}
        {latestTarget ? (
          <div className="max-w-[78%] self-end rounded-[9px] rounded-br-sm bg-rt-border px-[11px] py-2 text-xs text-rt-text">
            What should I know about {latestTarget}?
          </div>
        ) : (
          <div className="text-xs text-rt-dim">Waiting for a new scan…</div>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-sky-300">
            <Spinner size={12} />
            Running analysis…
          </div>
        ) : null}
        {error ? (
          <div className="max-w-[88%] rounded-[9px] rounded-bl-sm border border-rt-border bg-rt-raised px-[11px] py-2 text-xs leading-normal text-rose-300">
            {error}
          </div>
        ) : null}
        {analysis ? (
          <div className="max-w-[88%] rounded-[9px] rounded-bl-sm border border-rt-border bg-rt-raised px-[11px] py-2 text-xs leading-normal text-slate-300">
            {analysis.analysis}
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-rt-border px-3.5 py-[11px]">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about the current graph…"
          className="text-xs"
        />
        <Button type="submit" className="px-[13px] py-2 text-xs" disabled={!onSend}>
          Send
        </Button>
      </form>
    </aside>
  );
};
