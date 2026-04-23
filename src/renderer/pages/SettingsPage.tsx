import { useEffect, useState } from 'react';
import type { EnrichmentSettings } from '@shared/types';

const defaultSettings: EnrichmentSettings = {
  liveEnrichmentEnabled: false,
  geoEnrichmentEnabled: false,
  techEnrichmentEnabled: false,
  aiAssistantEnabled: false,
  aiApiKey: '',
  updatedAt: '',
};

interface SettingItemProps {
  label: string;
  tooltip: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

const SettingItem = ({
  label,
  tooltip,
  checked,
  disabled,
  onChange,
}: SettingItemProps): JSX.Element => (
  <label className="flex items-center justify-between rounded bg-slate-950 px-3 py-2">
    <span className="flex items-center gap-2 text-sm text-slate-200">
      {label}
      <span className="group relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] text-slate-100">
        ?
        <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-64 -translate-x-1/2 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs font-normal text-slate-200 shadow-lg group-hover:block">
          {tooltip}
        </span>
      </span>
    </span>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

export const SettingsPage = (): JSX.Element => {
  const [settings, setSettings] = useState<EnrichmentSettings>(defaultSettings);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.api.settings.getEnrichment();
      setSettings(next);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Unable to load settings';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const updateSetting = async (
    patch: Partial<EnrichmentSettings>,
  ): Promise<void> => {
    setError(null);
    try {
      const next = await window.api.settings.setEnrichment(patch);
      setSettings(next);
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : 'Unable to update setting';
      setError(message);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-100">Parametre</h2>
        <p className="text-sm text-slate-400">
          Configure les enrichissements optionnels du graph.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
        <SettingItem
          label="Live enrichment"
          tooltip="Active les requetes externes en direct pendant un scan (mode plus bruyant reseau, mais graphe plus riche)."
          checked={settings.liveEnrichmentEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ liveEnrichmentEnabled: checked })}
        />
        <SettingItem
          label="Geo enrichment"
          tooltip="Ajoute des nœuds geographiques (country/city) quand les donnees IP live sont disponibles."
          checked={settings.geoEnrichmentEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ geoEnrichmentEnabled: checked })}
        />
        <SettingItem
          label="Tech enrichment"
          tooltip="Ajoute des nœuds technologie/services detectes (headers, signatures techniques, etc.)."
          checked={settings.techEnrichmentEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ techEnrichmentEnabled: checked })}
        />
        <SettingItem
          label="AI assistant"
          tooltip="Declenche une analyse IA automatique apres chaque nouveau scan et affiche une popup en bas a droite."
          checked={settings.aiAssistantEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ aiAssistantEnabled: checked })}
        />
        {settings.aiAssistantEnabled ? (
          <label className="block rounded bg-slate-950 px-3 py-2">
            <span className="mb-1 block text-xs text-slate-400">OpenAI API key (user)</span>
            <input
              type="password"
              value={settings.aiApiKey}
              disabled={loading}
              placeholder="sk-..."
              onChange={(event) =>
                setSettings((previous) => ({ ...previous, aiApiKey: event.target.value }))
              }
              onBlur={(event) => void updateSetting({ aiApiKey: event.target.value.trim() })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Cle stockee localement sur cette machine uniquement.
            </p>
          </label>
        ) : null}
        <p className="text-xs text-slate-500">
          Last update:{' '}
          {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : 'n/a'}
        </p>
      </div>
    </section>
  );
};
