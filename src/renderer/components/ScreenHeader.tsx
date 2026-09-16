import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}

export const ScreenHeader = ({ title, subtitle, actions }: ScreenHeaderProps): JSX.Element => (
  <header className="mb-5 flex items-end justify-between gap-4">
    <div>
      <h1 className="m-0 text-[23px] font-semibold tracking-[-0.02em] text-rt-strong">
        {title}
      </h1>
      <p className="mb-0 mt-1 text-[12.5px] text-rt-dim">{subtitle}</p>
    </div>
    {actions}
  </header>
);
