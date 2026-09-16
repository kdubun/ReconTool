import { ScreenHeader } from '@renderer/components/ScreenHeader';
import { Button, Chip, Dot, Input, Toast, Toggle } from '@renderer/components/ui';

const surfaceSwatches: Array<{ name: string; hex: string }> = [
  { name: 'bg', hex: '#020617' },
  { name: 'surface', hex: '#0f172a' },
  { name: 'raised', hex: '#0b1220' },
  { name: 'border', hex: '#1e293b' },
  { name: 'border-hi', hex: '#334155' },
  { name: 'muted', hex: '#64748b' },
  { name: 'body', hex: '#cbd5e1' },
  { name: 'ink', hex: '#f8fafc' },
];

const statusSwatches: Array<{ name: string; hex: string }> = [
  { name: 'sky-600', hex: '#0284c7' },
  { name: 'sky-700', hex: '#0369a1' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'rose', hex: '#e11d48' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'ip red', hex: '#dc2626' },
  { name: 'service cyan', hex: '#06b6d4' },
];

const Swatch = ({
  name,
  hex,
  bordered,
}: {
  name: string;
  hex: string;
  bordered?: boolean;
}): JSX.Element => (
  <div>
    <div
      className={`h-[38px] rounded-[7px] ${bordered ? 'border border-rt-border' : ''}`}
      style={{ background: hex }}
    />
    <div className="mt-1.5 text-[11px] text-slate-300">{name}</div>
    <div className="font-mono text-[10px] text-rt-faint">{hex}</div>
  </div>
);

export const DesignSystemPage = (): JSX.Element => {
  return (
    <section>
      <ScreenHeader
        title="Design system"
        subtitle="Dark intel foundations — surfaces, type, controls and status language."
      />

      <div className="grid grid-cols-2 gap-3.5">
        <article className="rounded-[10px] border border-rt-border bg-rt-surface px-[18px] py-4">
          <h2 className="mb-3 text-[13px] font-semibold text-rt-heading">Surfaces & ink</h2>
          <div className="grid grid-cols-4 gap-[9px]">
            {surfaceSwatches.map((swatch) => (
              <Swatch key={swatch.name} name={swatch.name} hex={swatch.hex} bordered />
            ))}
          </div>
        </article>

        <article className="rounded-[10px] border border-rt-border bg-rt-surface px-[18px] py-4">
          <h2 className="mb-3 text-[13px] font-semibold text-rt-heading">Status & accent</h2>
          <div className="grid grid-cols-4 gap-[9px]">
            {statusSwatches.map((swatch) => (
              <Swatch key={swatch.name} name={swatch.name} hex={swatch.hex} />
            ))}
          </div>
        </article>

        <article className="rounded-[10px] border border-rt-border bg-rt-surface px-[18px] py-4">
          <h2 className="mb-3 text-[13px] font-semibold text-rt-heading">
            Typography — Inter / JetBrains Mono
          </h2>
          <div className="flex flex-col gap-[9px]">
            <div className="flex items-baseline gap-3.5">
              <span className="w-[78px] font-mono text-[10px] text-rt-faint">23/600</span>
              <span className="text-[23px] font-semibold tracking-[-0.02em] text-rt-strong">
                Screen title
              </span>
            </div>
            <div className="flex items-baseline gap-3.5">
              <span className="w-[78px] font-mono text-[10px] text-rt-faint">14/600</span>
              <span className="text-sm font-semibold text-rt-heading">Card heading</span>
            </div>
            <div className="flex items-baseline gap-3.5">
              <span className="w-[78px] font-mono text-[10px] text-rt-faint">12.5/400</span>
              <span className="text-[12.5px] text-slate-300">
                Body — dense but readable at 1440×900.
              </span>
            </div>
            <div className="flex items-baseline gap-3.5">
              <span className="w-[78px] font-mono text-[10px] text-rt-faint">10.5/500</span>
              <span className="text-[10.5px] font-medium tracking-[0.07em] text-rt-dim">
                METRIC LABEL
              </span>
            </div>
            <div className="flex items-baseline gap-3.5">
              <span className="w-[78px] font-mono text-[10px] text-rt-faint">mono 12</span>
              <span className="font-mono text-xs text-rt-text">
                198.202.211.1 · thecamp.fr · AS16276
              </span>
            </div>
          </div>
        </article>

        <article className="rounded-[10px] border border-rt-border bg-rt-surface px-[18px] py-4">
          <h2 className="mb-3 text-[13px] font-semibold text-rt-heading">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="success">Success</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <Button className="outline outline-2 outline-offset-2 outline-rt-focus">Focus</Button>
          </div>

          <h2 className="mb-2.5 mt-4 text-[13px] font-semibold text-rt-heading">
            Inputs & chips
          </h2>
          <div className="flex items-center gap-2">
            <Input placeholder="Search node value…" />
            <Toggle checked onChange={() => undefined} label="On" />
            <Toggle checked={false} onChange={() => undefined} label="Off" />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip active>
              <Dot type="domain" size={6} />
              domain
            </Chip>
            <Chip active={false}>
              <Dot type="ip" size={6} />
              ip
            </Chip>
            <Chip active={false}>
              <Dot type="nameserver" size={6} />
              nameserver
            </Chip>
          </div>
        </article>

        <article className="col-span-2 rounded-[10px] border border-rt-border bg-rt-surface px-[18px] py-4">
          <h2 className="mb-3 text-[13px] font-semibold text-rt-heading">Inline toasts</h2>
          <div className="grid grid-cols-3 gap-2.5">
            <Toast tone="error">Error — module unreachable</Toast>
            <Toast tone="success">Success — snapshot exported</Toast>
            <Toast tone="warning">Warning — import replaces data</Toast>
          </div>
        </article>
      </div>
    </section>
  );
};
