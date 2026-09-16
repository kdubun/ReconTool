interface TopBarProps {
  workspaceName?: string;
  sqliteRows: number;
}

export const TopBar = ({
  workspaceName = 'volatile-ram-01',
  sqliteRows,
}: TopBarProps): JSX.Element => {
  const rowLabel = sqliteRows === 1 ? 'row' : 'rows';

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3.5 border-b border-rt-border bg-[rgba(2,6,23,0.92)] px-8 py-2.5 backdrop-blur-[6px]">
      <div className="text-[11px] text-rt-dim">
        Workspace{' '}
        <span className="font-medium text-slate-300">{workspaceName}</span>
      </div>
      <div className="h-3.5 w-px bg-rt-border" />
      <div className="flex items-center gap-1.5 text-[11px] text-rt-dim">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full bg-rt-success shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
          aria-hidden="true"
        />
        SQLite local · {sqliteRows} {rowLabel}
      </div>
    </header>
  );
};
