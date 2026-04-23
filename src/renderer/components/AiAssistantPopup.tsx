import type { AiScanAnalysis } from '@shared/types';

interface AiAssistantPopupProps {
  assistantEnabled: boolean;
  hasApiKey: boolean;
  loading: boolean;
  latestTarget: string | null;
  analysis: AiScanAnalysis | null;
  error: string | null;
  onClose: () => void;
}

export const AiAssistantPopup = ({
  assistantEnabled,
  hasApiKey,
  loading,
  latestTarget,
  analysis,
  error,
  onClose,
}: AiAssistantPopupProps): JSX.Element => {
  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[380px] rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-slate-100 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">AI Assistant</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
        >
          Hide
        </button>
      </div>
      <p className="text-xs text-slate-400">
        {latestTarget ? `Last scan: ${latestTarget}` : 'Waiting for a new scan...'}
      </p>
      {!assistantEnabled ? (
        <p className="mt-2 rounded bg-amber-950 px-2 py-2 text-xs text-amber-200">
          AI assistant is disabled. Enable it in `Parametre` to analyze each new scan.
        </p>
      ) : null}
      {assistantEnabled && !hasApiKey ? (
        <p className="mt-2 rounded bg-amber-950 px-2 py-2 text-xs text-amber-200">
          Add your OpenAI API key in `Parametre` to activate analysis.
        </p>
      ) : null}

      {loading ? (
        <p className="mt-2 rounded bg-slate-900 px-2 py-2 text-xs text-sky-300">
          Running analysis...
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded bg-rose-950 px-2 py-2 text-xs text-rose-300">{error}</p>
      ) : null}

      {analysis ? (
        <div className="mt-2 rounded bg-slate-900 px-2 py-2">
          <p className="mb-1 text-[11px] text-slate-500">
            Model: {analysis.model} | {new Date(analysis.generatedAt).toLocaleTimeString()}
          </p>
          <pre className="max-h-56 whitespace-pre-wrap break-words text-xs text-slate-200">
            {analysis.analysis}
          </pre>
        </div>
      ) : null}
    </aside>
  );
};
