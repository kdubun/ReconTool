import { useMemo, useState, type FormEvent } from 'react';
import { Button, Chip, SearchIcon, TypeBadge } from '@renderer/components/ui';
import type { TargetType } from '@shared/types';

interface TargetFormProps {
  loading: boolean;
  onSubmit: (payload: { target: string; type: TargetType }) => Promise<void>;
}

const ACCEPTED: TargetType[] = [
  'domain',
  'ip',
  'email',
  'url',
  'cidr',
  'asn',
  'nameserver',
  'mx',
];

export const detectTargetType = (raw: string): TargetType => {
  const value = raw.trim();
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
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'email';
  }
  if (
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(value)
  ) {
    return 'ip';
  }
  if (/^(([0-9a-fA-F]{1,4}:){1,7}[0-9a-fA-F]{1,4}|::1|::)$/.test(value) || value.includes(':')) {
    return 'ip';
  }
  if (/^ns[0-9]*\./i.test(value)) {
    return 'nameserver';
  }
  if (/^(mx[0-9]*\.|mail\.)/i.test(value)) {
    return 'mx';
  }
  return 'domain';
};

export const TargetForm = ({ loading, onSubmit }: TargetFormProps): JSX.Element => {
  const [target, setTarget] = useState('');
  const detectedType = useMemo(() => detectTargetType(target), [target]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const normalizedTarget = target.trim();
    if (!normalizedTarget) {
      return;
    }
    await onSubmit({ target: normalizedTarget, type: detectedType });
  };

  return (
    <form className="rounded-[10px] border border-rt-border bg-rt-surface p-[18px]" onSubmit={handleSubmit}>
      <label className="mb-1.5 block text-[11px] font-medium tracking-[0.06em] text-rt-dim">
        TARGET
      </label>
      <div className="flex gap-2.5">
        <div className="relative flex min-w-0 flex-1 items-center">
          <span className="pointer-events-none absolute left-3">
            <SearchIcon size={15} stroke="#475569" />
          </span>
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="example.com · 8.8.8.8 · AS13335"
            className="w-full rounded-lg border border-rt-border-strong bg-rt-raised py-[11px] pl-[34px] pr-[168px] font-mono text-[13.5px] text-rt-heading"
          />
          {target.trim() ? (
            <span className="absolute right-2.5 flex items-center gap-1.5 text-[10.5px] text-rt-dim">
              <TypeBadge type={detectedType} />
              auto-detected
            </span>
          ) : null}
        </div>
        <Button
          type="submit"
          disabled={loading || !target.trim()}
          className="h-auto shrink-0 rounded-lg px-[22px] text-[13px]"
        >
          {loading ? 'Scanning…' : 'Run Recon'}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11px] text-rt-faint">Accepted:</span>
        {ACCEPTED.map((type) => (
          <Chip key={type} active={detectedType === type}>
            {type}
          </Chip>
        ))}
      </div>
    </form>
  );
};
