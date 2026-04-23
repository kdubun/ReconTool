import { useMemo, useState, type FormEvent } from 'react';
import type { TargetType } from '@shared/types';

interface TargetFormProps {
  loading: boolean;
  onSubmit: (payload: { target: string; type: TargetType }) => Promise<void>;
}

export const TargetForm = ({ loading, onSubmit }: TargetFormProps): JSX.Element => {
  const [target, setTarget] = useState('');

  const detectedType = useMemo<TargetType>(() => {
    const value = target.trim();
    if (!value) {
      return 'domain';
    }

    if (/^https?:\/\//i.test(value)) {
      return 'url';
    }

    if (/^as\d{1,10}$/i.test(value)) {
      return 'asn';
    }

    if (value.includes('/')) {
      const [ipPart, prefixPart] = value.split('/');
      const prefix = Number(prefixPart);
      if (Number.isInteger(prefix) && ipPart) {
        const isIpv4Cidr =
          /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(
            ipPart,
          ) && prefix >= 0 && prefix <= 32;
        const isIpv6Cidr = ipPart.includes(':') && prefix >= 0 && prefix <= 128;
        if (isIpv4Cidr || isIpv6Cidr) {
          return 'cidr';
        }
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(value)) {
      return 'email';
    }

    const ipv4Regex =
      /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
    if (ipv4Regex.test(value)) {
      return 'ip';
    }

    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){1,7}[0-9a-fA-F]{1,4}|::1|::)$/;
    if (ipv6Regex.test(value) || value.includes(':')) {
      return 'ip';
    }

    if (/^ns[0-9]*\./i.test(value)) {
      return 'nameserver';
    }
    if (/^(mx[0-9]*\.|mail\.)/i.test(value)) {
      return 'mx';
    }

    return 'domain';
  }, [target]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const normalizedTarget = target.trim();
    if (!normalizedTarget) {
      return;
    }
    await onSubmit({ target: normalizedTarget, type: detectedType });
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
          placeholder="example.com / https://site/page / 8.8.8.8 / 1.2.3.0/24 / AS13335"
        />
      </label>

      <div className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
        Detected type: <span className="font-semibold text-slate-100">{detectedType}</span>
      </div>

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
