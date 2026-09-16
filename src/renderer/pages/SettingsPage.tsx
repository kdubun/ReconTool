import { useEffect, useState } from 'react';
import { ScreenHeader } from '@renderer/components/ScreenHeader';
import { Button, Card, Input, Toast, Toggle } from '@renderer/components/ui';
import { maskSecret } from '@renderer/lib/reconView';
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
  nmapEnabled: false,
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

interface ModuleRow {
  id: string;
  name: string;
  desc: string;
  enabled: boolean;
  secret: string;
  extraSecret?: string;
  onToggle: (checked: boolean) => void;
  onSecret: (value: string) => void;
  onSecretBlur: (value: string) => void;
  onExtraSecret?: (value: string) => void;
  onExtraSecretBlur?: (value: string) => void;
  placeholder?: string;
}

export const SettingsPage = (): JSX.Element => {
  const [settings, setSettings] = useState<EnrichmentSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const loadSettings = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.api.settings.getEnrichment();
      setSettings(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const updateSetting = async (patch: Partial<EnrichmentSettings>): Promise<void> => {
    setError(null);
    try {
      const next = await window.api.settings.setEnrichment(patch);
      setSettings(next);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update setting');
    }
  };

  const modules: ModuleRow[] = [
    {
      id: 'shodan',
      name: 'Shodan',
      desc: 'Open ports, banners, service fingerprints',
      enabled: settings.shodanEnabled,
      secret: settings.shodanApiKey,
      onToggle: (checked) => void updateSetting({ shodanEnabled: checked }),
      onSecret: (value) => setSettings((prev) => ({ ...prev, shodanApiKey: value })),
      onSecretBlur: (value) => void updateSetting({ shodanApiKey: value }),
    },
    {
      id: 'censys',
      name: 'Censys',
      desc: 'Certificate transparency and host views',
      enabled: settings.censysEnabled,
      secret: settings.censysApiId,
      extraSecret: settings.censysApiSecret,
      onToggle: (checked) => void updateSetting({ censysEnabled: checked }),
      onSecret: (value) => setSettings((prev) => ({ ...prev, censysApiId: value })),
      onSecretBlur: (value) => void updateSetting({ censysApiId: value }),
      onExtraSecret: (value) => setSettings((prev) => ({ ...prev, censysApiSecret: value })),
      onExtraSecretBlur: (value) => void updateSetting({ censysApiSecret: value }),
    },
    {
      id: 'vt',
      name: 'VirusTotal',
      desc: 'Domain and IP reputation',
      enabled: settings.virusTotalEnabled,
      secret: settings.virusTotalApiKey,
      onToggle: (checked) => void updateSetting({ virusTotalEnabled: checked }),
      onSecret: (value) => setSettings((prev) => ({ ...prev, virusTotalApiKey: value })),
      onSecretBlur: (value) => void updateSetting({ virusTotalApiKey: value }),
    },
    {
      id: 'abuse',
      name: 'AbuseIPDB',
      desc: 'Abuse reports and confidence score',
      enabled: settings.abuseIpDbEnabled,
      secret: settings.abuseIpDbApiKey,
      onToggle: (checked) => void updateSetting({ abuseIpDbEnabled: checked }),
      onSecret: (value) => setSettings((prev) => ({ ...prev, abuseIpDbApiKey: value })),
      onSecretBlur: (value) => void updateSetting({ abuseIpDbApiKey: value }),
    },
    {
      id: 'geo',
      name: 'GeoIP',
      desc: 'Country, city and coordinates',
      enabled: settings.geoAdvancedEnabled,
      secret: settings.geoIpApiKey,
      onToggle: (checked) =>
        void updateSetting({ geoAdvancedEnabled: checked, geoEnrichmentEnabled: checked }),
      onSecret: (value) => setSettings((prev) => ({ ...prev, geoIpApiKey: value })),
      onSecretBlur: (value) => void updateSetting({ geoIpApiKey: value }),
    },
    {
      id: 'asn',
      name: 'ASN lookup',
      desc: 'Autonomous system and prefix ownership',
      enabled: settings.asnRegistryEnabled,
      secret: settings.asnRegistryApiKey,
      onToggle: (checked) => void updateSetting({ asnRegistryEnabled: checked }),
      onSecret: (value) => setSettings((prev) => ({ ...prev, asnRegistryApiKey: value })),
      onSecretBlur: (value) => void updateSetting({ asnRegistryApiKey: value }),
    },
    {
      id: 'nmap',
      name: 'Nmap',
      desc: 'Active port scan — local binary',
      enabled: settings.nmapEnabled,
      secret: settings.nmapEnabled ? 'binary: /usr/bin/nmap' : '',
      placeholder: 'binary: /usr/bin/nmap',
      onToggle: (checked) => void updateSetting({ nmapEnabled: checked, techEnrichmentEnabled: checked }),
      onSecret: () => undefined,
      onSecretBlur: () => undefined,
    },
  ];

  const activeCount = modules.filter((row) => row.enabled).length;

  return (
    <section className="max-w-[960px]">
      <ScreenHeader
        title="Parametre"
        subtitle="Live enrichment modules, credentials and assistant. Secrets stay in the OS keychain."
      />

      {error ? (
        <Toast tone="error" className="mb-3.5">
          {error}
        </Toast>
      ) : null}

      <Card className="mb-3.5 flex items-center gap-3.5">
        <div className="flex-1">
          <div className="text-sm font-semibold text-rt-heading">Live enrichment</div>
          <div className="mt-1 text-xs text-rt-dim">
            Master switch. When off, ReconTool stays strictly offline — no outbound request, whatever
            the module state below.
          </div>
        </div>
        <span className={`text-[11.5px] font-medium ${settings.liveEnrichmentEnabled ? 'text-emerald-400' : 'text-rt-dim'}`}>
          {settings.liveEnrichmentEnabled ? 'Enabled' : 'Disabled'}
        </span>
        <Toggle
          checked={settings.liveEnrichmentEnabled}
          disabled={loading}
          label="Live enrichment"
          onChange={(checked) => void updateSetting({ liveEnrichmentEnabled: checked })}
        />
      </Card>

      <div className="mb-3.5 overflow-hidden rounded-[10px] border border-rt-border bg-rt-surface">
        <div className="flex items-center gap-[9px] border-b border-rt-border px-[18px] py-3">
          <div className="text-[13.5px] font-semibold text-rt-heading">Modules</div>
          <span className="text-[11px] text-rt-dim">
            {activeCount} of {modules.length} active
          </span>
        </div>
        {modules.map((row) => {
          const open = Boolean(revealed[row.id]);
          const display = row.id === 'nmap'
            ? row.secret || 'not configured'
            : open
              ? row.secret || ''
              : maskSecret(row.secret);
          return (
            <div
              key={row.id}
              className="grid grid-cols-[190px_1fr_300px_70px] items-center gap-3.5 border-b border-rt-divider px-[18px] py-3 last:border-b-0"
            >
              <div className="flex items-center gap-[9px]">
                <span
                  className={`block h-1.5 w-1.5 shrink-0 rounded-full ${row.enabled ? 'bg-rt-success' : 'bg-rt-border-strong'}`}
                />
                <span className="text-[12.5px] font-medium text-rt-text">{row.name}</span>
              </div>
              <div className="text-[11.5px] text-rt-dim">{row.desc}</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    value={display}
                    readOnly={row.id === 'nmap' || !open}
                    disabled={loading}
                    placeholder={row.placeholder ?? 'not configured'}
                    onChange={(event) => row.onSecret(event.target.value)}
                    onBlur={(event) => row.onSecretBlur(event.target.value.trim())}
                    className={`min-w-0 flex-1 rounded-md border bg-rt-raised px-2.5 py-1.5 font-mono text-[11.5px] ${
                      row.enabled
                        ? 'border-rt-border-strong text-rt-muted'
                        : 'border-rt-border text-rt-faint'
                    }`}
                  />
                  {row.id !== 'nmap' ? (
                    <Button
                      variant="secondary"
                      className="rounded-md px-[9px] py-1.5 text-[11px] text-rt-muted"
                      onClick={() =>
                        setRevealed((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                      }
                    >
                      {open ? 'Hide' : 'Reveal'}
                    </Button>
                  ) : null}
                </div>
                {row.extraSecret !== undefined && open ? (
                  <input
                    value={row.extraSecret}
                    disabled={loading}
                    placeholder="API secret"
                    onChange={(event) => row.onExtraSecret?.(event.target.value)}
                    onBlur={(event) => row.onExtraSecretBlur?.(event.target.value.trim())}
                    className="rounded-md border border-rt-border-strong bg-rt-raised px-2.5 py-1.5 font-mono text-[11.5px] text-rt-muted"
                  />
                ) : null}
              </div>
              <div className="flex justify-end">
                <Toggle
                  checked={row.enabled}
                  disabled={loading}
                  label={row.name}
                  onChange={row.onToggle}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold text-rt-heading">AI Assistant</div>
            <div className="mt-1 text-xs text-rt-dim">
              Summarises scan results and suggests pivots. Sends node metadata to the provider when
              enabled.
            </div>
          </div>
          <Toggle
            checked={settings.aiAssistantEnabled}
            disabled={loading}
            label="AI Assistant"
            onChange={(checked) => void updateSetting({ aiAssistantEnabled: checked })}
          />
        </div>
        <div className="mt-3.5 flex gap-2.5">
          <div className="flex-1">
            <label className="mb-1.5 block text-[11px] text-rt-dim">API key</label>
            <Input
              type={revealed.ai ? 'text' : 'password'}
              value={settings.aiApiKey}
              disabled={loading || !settings.aiAssistantEnabled}
              placeholder="sk-…"
              className="font-mono text-rt-muted"
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, aiApiKey: event.target.value }))
              }
              onBlur={(event) => void updateSetting({ aiApiKey: event.target.value.trim() })}
            />
          </div>
          <div className="w-[200px]">
            <label className="mb-1.5 block text-[11px] text-rt-dim">Model</label>
            <Input value="gpt-4o-mini" readOnly className="text-rt-text" />
          </div>
        </div>
        <div className="mt-2">
          <Button
            variant="ghost"
            className="px-2 py-1 text-[11px]"
            disabled={!settings.aiAssistantEnabled}
            onClick={() => setRevealed((prev) => ({ ...prev, ai: !prev.ai }))}
          >
            {revealed.ai ? 'Hide key' : 'Reveal key'}
          </Button>
        </div>
      </Card>
    </section>
  );
};
