export type PageKey =
  | 'dashboard'
  | 'recon'
  | 'history'
  | 'network'
  | 'graph'
  | 'settings';

interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}

const navigation: Array<{ key: PageKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'recon', label: 'Recon' },
  { key: 'history', label: 'History' },
  { key: 'network', label: 'Network' },
  { key: 'graph', label: 'Graph Intel' },
];

export const Sidebar = ({ activePage, onNavigate }: SidebarProps): JSX.Element => {
  const settingsActive = activePage === 'settings';

  return (
    <aside className="sticky top-0 h-screen w-[200px] shrink-0 border-r border-slate-800 bg-slate-950 px-3 py-5">
      <h1 className="mb-6 px-2 text-lg font-semibold text-slate-100">ReconTool</h1>
      <nav className="flex h-[calc(100%-3.5rem)] flex-col gap-2">
        {navigation.map((item) => {
          const isActive = activePage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`rounded-md px-3 py-2 text-left text-sm transition ${
                isActive
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={`mt-auto rounded-md px-3 py-2 text-left text-sm transition ${
            settingsActive
              ? 'bg-sky-600 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
          }`}
        >
          Parametre
        </button>
      </nav>
    </aside>
  );
};
