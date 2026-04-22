import { useState, type FormEvent } from 'react';
import type { TargetType } from '@shared/types';

interface TargetFormProps {
  loading: boolean;
  onSubmit: (payload: { target: string; type: TargetType }) => Promise<void>;
}

export const TargetForm = ({ loading, onSubmit }: TargetFormProps): JSX.Element => {
  const [target, setTarget] = useState('');
  const [type, setType] = useState<TargetType>('domain');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const normalizedTarget = target.trim();
    if (!normalizedTarget) {
      return;
    }
    await onSubmit({ target: normalizedTarget, type });
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-900 p-6"
      onSubmit={handleSubmit}
    >
      <label className="flex flex-col gap-2 text-sm text-slate-300">
        Target
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          placeholder="example.com / 8.8.8.8 / hello@corp.com"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-slate-300">
        Type
        <select
          value={type}
          onChange={(event) => setType(event.target.value as TargetType)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          <option value="domain">Domain</option>
          <option value="ip">IP</option>
          <option value="email">Email</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-600"
      >
        {loading ? 'Scanning...' : 'Run Recon'}
      </button>
    </form>
  );
};
