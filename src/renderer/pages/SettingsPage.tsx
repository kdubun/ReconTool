import { useEffect, useState } from 'react';
import type { EnrichmentSettings } from '@shared/types';

const defaultSettings: EnrichmentSettings = {
  liveEnrichmentEnabled: false,
  geoEnrichmentEnabled: false,
  techEnrichmentEnabled: false,
  shodanEnabled: false,
  censysEnabled: false,
  virusTotalEnabled: false,
  abuseIpDbEnabled: false,
  geoAdvancedEnabled: false,
  asnRegistryEnabled: false,
  shodanApiKey: '',
  censysApiId: '',
  censysApiSecret: '',
  virusTotalApiKey: '',
  abuseIpDbApiKey: '',
  geoIpApiKey: '',
  asnRegistryApiKey: '',
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

interface SecretInputProps {
  label: string;
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
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

const SecretInput = ({
  label,
  value,
  disabled,
  placeholder,
  onChange,
  onBlur,
}: SecretInputProps): JSX.Element => (
  <label className="block rounded bg-slate-950 px-3 py-2">
    <span className="mb-1 block text-xs text-slate-400">{label}</span>
    <input
      type="password"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onBlur(event.target.value.trim())}
      className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
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
        <SettingItem
          label="Shodan enrichment"
          tooltip="Ajoute ports, services, banniere et OS depuis Shodan sur IP (necessite cle API user)."
          checked={settings.shodanEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ shodanEnabled: checked })}
        />
        <SettingItem
          label="Censys enrichment"
          tooltip="Ajoute des informations hote depuis Censys (toggle pret pour extensions futures)."
          checked={settings.censysEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ censysEnabled: checked })}
        />
        <SettingItem
          label="VirusTotal passive"
          tooltip="Ajoute signaux passifs/relationnels VirusTotal (si cle API fournie)."
          checked={settings.virusTotalEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ virusTotalEnabled: checked })}
        />
        <SettingItem
          label="AbuseIPDB intel"
          tooltip="Ajoute score de reputation abuse pour les IPs scannees."
          checked={settings.abuseIpDbEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ abuseIpDbEnabled: checked })}
        />
        <SettingItem
          label="GeoIP avance"
          tooltip="Active les enrichissements geoloc avances via provider externe."
          checked={settings.geoAdvancedEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ geoAdvancedEnabled: checked })}
        />
        <SettingItem
          label="ASN registry details"
          tooltip="Ajoute des details registre ASN/operateur (mode discret, optionnel)."
          checked={settings.asnRegistryEnabled}
          disabled={loading}
          onChange={(checked) => void updateSetting({ asnRegistryEnabled: checked })}
        />
        {settings.shodanEnabled ? (
          <SecretInput
            label="Shodan API key"
            value={settings.shodanApiKey}
            disabled={loading}
            placeholder="shodan-key..."
            onChange={(value) =>
              setSettings((previous) => ({ ...previous, shodanApiKey: value }))
            }
            onBlur={(value) => void updateSetting({ shodanApiKey: value })}
          />
        ) : null}
        {settings.censysEnabled ? (
          <>
            <SecretInput
              label="Censys API ID"
              value={settings.censysApiId}
              disabled={loading}
              placeholder="censys-id..."
              onChange={(value) =>
                setSettings((previous) => ({ ...previous, censysApiId: value }))
              }
              onBlur={(value) => void updateSetting({ censysApiId: value })}
            />
            <SecretInput
              label="Censys API Secret"
              value={settings.censysApiSecret}
              disabled={loading}
              placeholder="censys-secret..."
              onChange={(value) =>
                setSettings((previous) => ({ ...previous, censysApiSecret: value }))
              }
              onBlur={(value) => void updateSetting({ censysApiSecret: value })}
            />
          </>
        ) : null}
        {settings.virusTotalEnabled ? (
          <SecretInput
            label="VirusTotal API key"
            value={settings.virusTotalApiKey}
            disabled={loading}
            placeholder="vt-key..."
            onChange={(value) =>
              setSettings((previous) => ({ ...previous, virusTotalApiKey: value }))
            }
            onBlur={(value) => void updateSetting({ virusTotalApiKey: value })}
          />
        ) : null}
        {settings.abuseIpDbEnabled ? (
          <SecretInput
            label="AbuseIPDB API key"
            value={settings.abuseIpDbApiKey}
            disabled={loading}
            placeholder="abuseipdb-key..."
            onChange={(value) =>
              setSettings((previous) => ({ ...previous, abuseIpDbApiKey: value }))
            }
            onBlur={(value) => void updateSetting({ abuseIpDbApiKey: value })}
          />
        ) : null}
        {settings.geoAdvancedEnabled ? (
          <SecretInput
            label="GeoIP provider API key"
            value={settings.geoIpApiKey}
            disabled={loading}
            placeholder="geoip-key..."
            onChange={(value) =>
              setSettings((previous) => ({ ...previous, geoIpApiKey: value }))
            }
            onBlur={(value) => void updateSetting({ geoIpApiKey: value })}
          />
        ) : null}
        {settings.asnRegistryEnabled ? (
          <SecretInput
            label="ASN registry API key"
            value={settings.asnRegistryApiKey}
            disabled={loading}
            placeholder="asn-registry-key..."
            onChange={(value) =>
              setSettings((previous) => ({ ...previous, asnRegistryApiKey: value }))
            }
            onBlur={(value) => void updateSetting({ asnRegistryApiKey: value })}
          />
        ) : null}
        {settings.aiAssistantEnabled ? (
          <div className="space-y-1 rounded bg-slate-950 px-3 py-2">
            <SecretInput
              label="OpenAI API key (user)"
              value={settings.aiApiKey}
              disabled={loading}
              placeholder="sk-..."
              onChange={(value) =>
                setSettings((previous) => ({ ...previous, aiApiKey: value }))
              }
              onBlur={(value) => void updateSetting({ aiApiKey: value })}
            />
            <p className="text-[11px] text-slate-500">
              Cles stockees localement sur cette machine uniquement.
            </p>
          </div>
        ) : null}
        <p className="text-xs text-slate-500">
          Last update:{' '}
          {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : 'n/a'}
        </p>
      </div>
    </section>
  );
};
