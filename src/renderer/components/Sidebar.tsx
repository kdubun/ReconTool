export type PageKey =
  | 'dashboard'
  | 'recon'
  | 'history'
  | 'network'
  | 'graph'
  | 'transfer'
  | 'system'
  | 'settings';

interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}

const primaryNav: Array<{ key: PageKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'recon', label: 'Recon' },
  { key: 'history', label: 'History' },
  { key: 'network', label: 'Network' },
  { key: 'graph', label: 'Graph Intel' },
  { key: 'transfer', label: 'Import / Export' },
];

const utilityNav: Array<{ key: PageKey; label: string }> = [
  { key: 'system', label: 'Design system' },
  { key: 'settings', label: 'Parametre' },
];

const SearchMark = (): JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

interface NavButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavButton = ({ label, active, onClick }: NavButtonProps): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-[9px] rounded-[7px] px-2.5 py-2 text-left text-[12.5px] transition-[background-color] duration-[120ms] ${
      active
        ? 'bg-rt-accent font-semibold text-white'
        : 'bg-transparent font-medium text-rt-muted hover:bg-rt-surface'
    }`}
  >
    <span
      className={`block h-[5px] w-[5px] shrink-0 rounded-full ${
        active ? 'bg-white' : 'bg-rt-border-strong'
      }`}
    />
    <span>{label}</span>
  </button>
);

export const Sidebar = ({ activePage, onNavigate }: SidebarProps): JSX.Element => {
  return (
    <aside className="flex h-full min-h-0 w-[200px] shrink-0 flex-col border-r border-rt-border bg-rt-raised px-3 pb-3.5 pt-[18px]">
      <div className="mb-[18px] flex items-center gap-[9px] px-2">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-rt-accent">
          <SearchMark />
        </div>
        <div>
          <div className="text-[13.5px] font-semibold tracking-[-0.01em] text-rt-heading">
            ReconTool
          </div>
          <div className="text-[9.5px] font-medium tracking-[0.06em] text-rt-faint">
            OFFLINE-FIRST
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {primaryNav.map((item) => (
          <NavButton
            key={item.key}
            label={item.label}
            active={activePage === item.key}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </nav>

      <div className="flex-1" />

      <nav className="flex flex-col gap-0.5 border-t border-rt-border pt-2.5">
        {utilityNav.map((item) => (
          <NavButton
            key={item.key}
            label={item.label}
            active={activePage === item.key}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </nav>
    </aside>
  );
};
