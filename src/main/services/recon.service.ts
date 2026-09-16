import axios from 'axios';
import { execFile } from 'node:child_process';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import tls from 'node:tls';
import { URL } from 'node:url';
import whois from 'whois-json';
import { getDatabase } from '@main/database/init';
import {
  clearGraph,
  createRelation,
  createTarget,
} from '@main/services/graph.service';
import type {
  AiScanAnalysis,
  EnrichmentSettings,
  GraphSourceType,
  ReconResult,
  TargetType,
} from '@shared/types';

const execFileAsync = promisify(execFile);

type ReconRow = {
  id: number;
  target: string;
  type: string;
  dns: string | null;
  whois: string | null;
  headers: string | null;
  created_at: string;
};

type DnsResult = {
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  txt: string[];
  cname: string[];
  ptr: string[];
  soa: string[];
  caa: string[];
  dnskey: string[];
  ds: string[];
  dmarc: string[];
  dkim: string[];
  spf: string[];
};

type EnrichmentSettingsRow = {
  live_enrichment_enabled: number;
  geo_enrichment_enabled: number;
  tech_enrichment_enabled: number;
  shodan_enabled: number;
  censys_enabled: number;
  virustotal_enabled: number;
  abuseipdb_enabled: number;
  geo_advanced_enabled: number;
  asn_registry_enabled: number;
  nmap_enabled: number;
  shodan_api_key: string;
  censys_api_id: string;
  censys_api_secret: string;
  virustotal_api_key: string;
  abuseipdb_api_key: string;
  geoip_api_key: string;
  asn_registry_api_key: string;
  ai_assistant_enabled: number;
  ai_api_key: string;
  updated_at: string;
};

type RelationContextRow = {
  relation_type: string;
  confidence: number;
  weight: number;
  source_value: string;
  source_type: string;
  target_value: string;
  target_type: string;
};

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type NmapHostResult = {
  ip: string;
  ports: string[];
  services: string[];
  os?: string;
};

type LiveIpEnrichment = {
  asn?: string;
  org?: string;
  country?: string;
  city?: string;
  cidr?: string;
  ports?: string[];
  services?: string[];
  os?: string;
  abuseScore?: number;
  nmapHosts?: NmapHostResult[];
};

type TlsCertificateSummary = {
  subjectCN?: string;
  san?: string[];
  issuerCN?: string;
  validFrom?: string;
  validTo?: string;
};

type ScanArtifact = {
  artifactType: string;
  value: string;
  confidence: number;
  source: GraphSourceType;
  metadata: Record<string, unknown>;
};

const isTargetType = (value: string): value is TargetType =>
  value === 'domain' ||
  value === 'ip' ||
  value === 'email' ||
  value === 'url' ||
  value === 'cidr' ||
  value === 'asn' ||
  value === 'nameserver' ||
  value === 'mx';

const parseJsonOrNull = (value: string | null): unknown | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const extractEmailsFromObject = (source: unknown): string[] => {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const text = JSON.stringify(source);
  const matches = text.match(emailRegex) ?? [];
  return [...new Set(matches.map((match) => match.toLowerCase()))];
};

const extractPhonesFromObject = (source: unknown): string[] => {
  const phoneKeyHints = ['phone', 'telephone', 'tel', 'mobile', 'fax', 'contactphone'];
  const candidates = new Set<string>();

  const walk = (value: unknown, keyPath: string[]): void => {
    if (value == null) {
      return;
    }
    if (typeof value === 'string') {
      const fromPhoneField = keyPath.some((key) =>
        phoneKeyHints.some((hint) => key.toLowerCase().includes(hint)),
      );
      if (fromPhoneField) {
        candidates.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => walk(entry, keyPath));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, entry]) =>
        walk(entry, [...keyPath, key]),
      );
    }
  };

  const normalizePhone = (raw: string): string | null => {
    const cleaned = raw.replace(/[^0-9+]/g, '');
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      return null;
    }
    if (/^\d{4}\d{2}\d{2}$/.test(digits)) {
      return null;
    }
    if (/^\d{1,3}\d{1,3}\d{1,3}\d{1,3}$/.test(digits) && raw.includes('.')) {
      return null;
    }
    if (cleaned.startsWith('+')) {
      return `+${digits}`;
    }
    return digits;
  };

  walk(source, []);
  const validPhones = [...candidates]
    .map((candidate) => normalizePhone(candidate))
    .filter((value): value is string => value !== null);

  return [...new Set(validPhones)];
};

const extractWhoisValue = (source: unknown, candidateKeys: string[]): string[] => {
  if (!source || typeof source !== 'object') {
    return [];
  }

  const entries = Object.entries(source as Record<string, unknown>);
  const values: string[] = [];
  entries.forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    const keyMatched = candidateKeys.some((candidate) => lowerKey.includes(candidate));
    if (keyMatched && typeof value === 'string' && value.trim()) {
      values.push(value.trim());
    }
    if (value && typeof value === 'object') {
      values.push(...extractWhoisValue(value, candidateKeys));
    }
  });
  return [...new Set(values)];
};

const extractSubdomainsFromDns = (domain: string, dnsData: DnsResult): string[] => {
  const suffix = `.${domain.toLowerCase()}`;
  const candidates = [...dnsData.cname, ...dnsData.ptr];
  return [
    ...new Set(
      candidates
        .map((candidate) => candidate.toLowerCase().replace(/\.$/, ''))
        .filter((candidate) => candidate.endsWith(suffix) && candidate !== domain.toLowerCase()),
    ),
  ];
};

const resolveSafe = async <T>(
  resolver: () => Promise<T>,
  fallback: T,
): Promise<T> => {
  try {
    return await resolver();
  } catch {
    return fallback;
  }
};

const collectDnsRecords = async (domain: string): Promise<DnsResult> => {
  const [a, aaaa, mx, ns, txt, cname, soa, caa, dnskey, ds, dmarcTxt] = await Promise.all([
    resolveSafe(() => dns.resolve4(domain), [] as string[]),
    resolveSafe(() => dns.resolve6(domain), [] as string[]),
    resolveSafe(() => dns.resolveMx(domain), [] as Array<{ exchange: string }>),
    resolveSafe(() => dns.resolveNs(domain), [] as string[]),
    resolveSafe(() => dns.resolveTxt(domain), [] as string[][]),
    resolveSafe(() => dns.resolveCname(domain), [] as string[]),
    resolveSafe(async () => {
      const record = await dns.resolveSoa(domain);
      return [`${record.nsname} ${record.hostmaster}`];
    }, [] as string[]),
    resolveSafe(async () => {
      const records = (await dns.resolve(domain, 'CAA')) as unknown as Array<{
        critical?: number;
        issue?: string;
        tag?: string;
        value?: string;
      }>;
      return records.map((record) =>
        `${String(record.critical ?? 0)} ${String(record.issue ?? record.tag ?? '')} ${String(
          record.value ?? '',
        )}`.trim(),
      );
    }, [] as string[]),
    resolveSafe(async () => {
      const records = (await dns.resolve(domain, 'DNSKEY')) as string[];
      return records.map((record) => String(record));
    }, [] as string[]),
    resolveSafe(async () => {
      const records = (await dns.resolve(domain, 'DS')) as string[];
      return records.map((record) => String(record));
    }, [] as string[]),
    resolveSafe(async () => {
      const entries = await dns.resolveTxt(`_dmarc.${domain}`);
      return entries.map((entry) => entry.join(' '));
    }, [] as string[]),
  ]);
  const flatTxt = txt.map((entry) => entry.join(' '));
  const spf = flatTxt.filter((entry) => entry.toLowerCase().startsWith('v=spf1'));
  const dkimSelectors = ['default', 'selector1', 'selector2', 'google', 'k1'];
  const dkim = (
    await Promise.all(
      dkimSelectors.map((selector) =>
        resolveSafe(async () => {
          const entries = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
          return entries.map((entry) => entry.join(' '));
        }, [] as string[]),
      ),
    )
  ).flat();

  return {
    a,
    aaaa,
    mx: mx.map((record) => record.exchange),
    ns,
    txt: flatTxt,
    cname,
    ptr: [],
    soa,
    caa,
    dnskey,
    ds,
    dmarc: dmarcTxt,
    dkim,
    spf,
  };
};

const collectIpRecords = async (ip: string): Promise<DnsResult> => {
  const ptr = await resolveSafe(() => dns.reverse(ip), [] as string[]);
  return {
    a: [],
    aaaa: [],
    mx: [],
    ns: [],
    txt: [],
    cname: [],
    ptr,
    soa: [],
    caa: [],
    dnskey: [],
    ds: [],
    dmarc: [],
    dkim: [],
    spf: [],
  };
};

const formatHostForUrl = (target: string, type: TargetType): string => {
  if (type !== 'ip') {
    return target;
  }
  return isIP(target) === 6 ? `[${target}]` : target;
};

const buildTargetUrl = (target: string, type: TargetType): string => {
  if (type === 'url') {
    return target;
  }
  if (type === 'domain' || type === 'nameserver' || type === 'mx') {
    return `https://${target}`;
  }
  if (type === 'ip') {
    return `http://${formatHostForUrl(target, type)}`;
  }
  if (type === 'asn' || type === 'cidr') {
    return '';
  }
  const domain = target.split('@')[1] ?? '';
  return `https://${domain}`;
};

const fetchHeaders = async (target: string, type: TargetType): Promise<unknown> => {
  const url = buildTargetUrl(target, type);
  if (!url) {
    return null;
  }

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      maxRedirects: 3,
      validateStatus: () => true,
    });
    return response.headers;
  } catch {
    return null;
  }
};

const deriveCidr = (ip: string): string | undefined => {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }
  if (version === 6) {
    const chunks = ip.split(':');
    return `${chunks.slice(0, 4).join(':')}::/64`;
  }
  return undefined;
};

const isValidCidr = (value: string): boolean => {
  const [ip, prefix] = value.split('/');
  if (!ip || !prefix) {
    return false;
  }
  const prefixNumber = Number(prefix);
  const version = isIP(ip);
  if (version === 4) {
    return Number.isInteger(prefixNumber) && prefixNumber >= 0 && prefixNumber <= 32;
  }
  if (version === 6) {
    return Number.isInteger(prefixNumber) && prefixNumber >= 0 && prefixNumber <= 128;
  }
  return false;
};

const isValidAsn = (value: string): boolean => /^AS\d{1,10}$/i.test(value.trim());

const parseUrlHostname = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    return parsed.hostname || null;
  } catch {
    return null;
  }
};

const fetchTlsCertificate = async (host: string): Promise<TlsCertificateSummary | null> =>
  new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
        timeout: 4000,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate(true) as unknown as {
            subject?: { CN?: string };
            issuer?: { CN?: string };
            subjectaltname?: string;
            valid_from?: string;
            valid_to?: string;
          };
          const subject = cert.subject ?? {};
          const issuer = cert.issuer ?? {};
          const sanText =
            typeof cert.subjectaltname === 'string' ? cert.subjectaltname : '';
          const san = sanText
            .split(',')
            .map((entry) => entry.replace('DNS:', '').trim())
            .filter((entry) => entry.length > 0);
          const summary: TlsCertificateSummary = { san };
          if (typeof subject.CN === 'string') {
            summary.subjectCN = subject.CN;
          }
          if (typeof issuer.CN === 'string') {
            summary.issuerCN = issuer.CN;
          }
          if (typeof cert.valid_from === 'string') {
            summary.validFrom = cert.valid_from;
          }
          if (typeof cert.valid_to === 'string') {
            summary.validTo = cert.valid_to;
          }
          resolve(summary);
        } catch {
          resolve(null);
        } finally {
          socket.end();
        }
      },
    );
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });

const parseNmapGrepable = (
  output: string,
  ip: string,
): NmapHostResult => {
  const ports: string[] = [];
  const services: string[] = [];
  let os: string | undefined;

  for (const line of output.split('\n')) {
    if (!line.startsWith('Host:') || !line.includes('Ports:')) {
      const osMatch = line.match(/OS:\s*([^;]+)/i);
      if (osMatch?.[1]) {
        os = osMatch[1].trim();
      }
      continue;
    }

    const portsSection = line.split('Ports:')[1]?.split('\t')[0] ?? '';
    for (const entry of portsSection.split(',')) {
      const parts = entry.trim().split('/');
      if (parts.length < 5) {
        continue;
      }
      const [port, state, , , service, , version] = parts;
      if (state !== 'open' || !port) {
        continue;
      }
      ports.push(port);
      const serviceLabel = [service, version].filter((part) => part && part.length > 0).join(' ');
      if (serviceLabel) {
        services.push(serviceLabel);
      }
    }
  }

  return {
    ip,
    ports: [...new Set(ports)],
    services: [...new Set(services)],
    ...(os ? { os } : {}),
  };
};

const runNmapScan = async (ip: string): Promise<NmapHostResult> => {
  try {
    const { stdout } = await execFileAsync(
      'nmap',
      [
        '-Pn',
        '-sT',
        '-sV',
        '--version-intensity',
        '2',
        '-F',
        '--open',
        '-T4',
        '--host-timeout',
        '45s',
        '-oG',
        '-',
        ip,
      ],
      {
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024,
        env: process.env,
      },
    );
    return parseNmapGrepable(stdout, ip);
  } catch {
    return { ip, ports: [], services: [] };
  }
};

const mergeNmapIntoEnrichment = (
  enrichment: LiveIpEnrichment,
  nmapResult: NmapHostResult,
): LiveIpEnrichment => {
  enrichment.ports = [...new Set([...(enrichment.ports ?? []), ...nmapResult.ports])];
  enrichment.services = [
    ...new Set([...(enrichment.services ?? []), ...nmapResult.services]),
  ];
  if (!enrichment.os && nmapResult.os) {
    enrichment.os = nmapResult.os;
  }
  return enrichment;
};

const applyPortEnrichmentToIpNode = (
  ipValue: string,
  enrichment: Pick<LiveIpEnrichment, 'ports' | 'services' | 'os'>,
  scanId: number,
  evidencePrefix: string,
): void => {
  const ipNode = createTarget(ipValue, 'ip');
  (enrichment.ports ?? []).forEach((port) => {
    const portNode = createTarget(port, 'port');
    createRelation(ipNode.id, portNode.id, 'ip->port', {
      confidence: 0.78,
      source: 'live',
      scanId,
      evidence: [`${evidencePrefix}:ports`],
    });
  });
  (enrichment.services ?? []).forEach((service) => {
    const serviceNode = createTarget(service, 'service');
    createRelation(ipNode.id, serviceNode.id, 'ip->service', {
      confidence: 0.76,
      source: 'live',
      scanId,
      evidence: [`${evidencePrefix}:service`],
    });
  });
  if (enrichment.os) {
    const osNode = createTarget(enrichment.os, 'os');
    createRelation(ipNode.id, osNode.id, 'ip->os', {
      confidence: 0.7,
      source: 'live',
      scanId,
      evidence: [`${evidencePrefix}:os`],
    });
  }
};

const fetchLiveIpEnrichment = async (
  ip: string,
  settings: EnrichmentSettings,
): Promise<LiveIpEnrichment> => {
  const enrichment: LiveIpEnrichment = {};
  const derivedCidr = deriveCidr(ip);
  if (derivedCidr) {
    enrichment.cidr = derivedCidr;
  }

  try {
    const response = await axios.get(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      timeout: 3500,
      validateStatus: () => true,
    });
    const payload = response.data as Record<string, unknown>;
    Object.assign(enrichment, {
      asn: typeof payload.connection === 'object' && payload.connection
        ? String((payload.connection as Record<string, unknown>).asn ?? '')
        : undefined,
      org: typeof payload.connection === 'object' && payload.connection
        ? String((payload.connection as Record<string, unknown>).org ?? '')
        : undefined,
      country: typeof payload.country === 'string' ? payload.country : undefined,
      city: typeof payload.city === 'string' ? payload.city : undefined,
    });
  } catch {
    // no-op, keep base enrichment
  }

  if (settings.shodanEnabled && settings.shodanApiKey.trim()) {
    try {
      const shodan = await axios.get(
        `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(
          settings.shodanApiKey,
        )}`,
        { timeout: 4000, validateStatus: () => true },
      );
      const payload = shodan.data as Record<string, unknown>;
      const ports = Array.isArray(payload.ports)
        ? payload.ports.map((port) => String(port))
        : [];
      const services = Array.isArray(payload.data)
        ? (payload.data as Array<Record<string, unknown>>)
            .map((entry) => (typeof entry.product === 'string' ? entry.product : null))
            .filter((entry): entry is string => entry !== null)
        : [];
      enrichment.ports = [...new Set([...(enrichment.ports ?? []), ...ports])];
      enrichment.services = [...new Set([...(enrichment.services ?? []), ...services])];
      if (typeof payload.os === 'string') {
        enrichment.os = payload.os;
      }
    } catch {
      // optional source, ignore failures
    }
  }

  if (settings.censysEnabled && settings.censysApiId.trim() && settings.censysApiSecret.trim()) {
    try {
      const censys = await axios.get(
        `https://search.censys.io/api/v2/hosts/${encodeURIComponent(ip)}`,
        {
          timeout: 4500,
          validateStatus: () => true,
          auth: {
            username: settings.censysApiId,
            password: settings.censysApiSecret,
          },
        },
      );
      const result = (censys.data as Record<string, unknown>).result as
        | Record<string, unknown>
        | undefined;
      const services = Array.isArray(result?.services)
        ? (result?.services as Array<Record<string, unknown>>)
        : [];
      const serviceNames = services
        .map((entry) =>
          typeof entry.service_name === 'string' ? entry.service_name : null,
        )
        .filter((entry): entry is string => entry !== null);
      const ports = services
        .map((entry) =>
          typeof entry.port === 'number' || typeof entry.port === 'string'
            ? String(entry.port)
            : null,
        )
        .filter((entry): entry is string => entry !== null);
      enrichment.services = [...new Set([...(enrichment.services ?? []), ...serviceNames])];
      enrichment.ports = [...new Set([...(enrichment.ports ?? []), ...ports])];
      const operatingSystem = result?.operating_system as
        | Record<string, unknown>
        | undefined;
      if (!enrichment.os && typeof operatingSystem?.product === 'string') {
        enrichment.os = operatingSystem.product;
      }
    } catch {
      // optional source, ignore failures
    }
  }

  if (settings.virusTotalEnabled && settings.virusTotalApiKey.trim()) {
    try {
      const vt = await axios.get(
        `https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`,
        {
          timeout: 4500,
          validateStatus: () => true,
          headers: { 'x-apikey': settings.virusTotalApiKey },
        },
      );
      const attributes = (vt.data as Record<string, unknown>)?.data as
        | Record<string, unknown>
        | undefined;
      const vtAttributes = attributes?.attributes as Record<string, unknown> | undefined;
      const asOwner =
        vtAttributes && typeof vtAttributes.as_owner === 'string'
          ? vtAttributes.as_owner
          : undefined;
      if (asOwner && !enrichment.org) {
        enrichment.org = asOwner;
      }
    } catch {
      // optional source, ignore failures
    }
  }

  if (settings.abuseIpDbEnabled && settings.abuseIpDbApiKey.trim()) {
    try {
      const abuse = await axios.get('https://api.abuseipdb.com/api/v2/check', {
        timeout: 3500,
        validateStatus: () => true,
        params: {
          ipAddress: ip,
          maxAgeInDays: 90,
        },
        headers: {
          Key: settings.abuseIpDbApiKey,
          Accept: 'application/json',
        },
      });
      const payload = abuse.data as Record<string, unknown>;
      const data = payload.data as Record<string, unknown> | undefined;
      if (data && typeof data.abuseConfidenceScore === 'number') {
        enrichment.abuseScore = data.abuseConfidenceScore;
      }
    } catch {
      // optional source, ignore failures
    }
  }

  if (settings.geoAdvancedEnabled && settings.geoIpApiKey.trim()) {
    try {
      const geo = await axios.get(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
        timeout: 3500,
        validateStatus: () => true,
        params: { token: settings.geoIpApiKey },
      });
      const payload = geo.data as Record<string, unknown>;
      if (!enrichment.city && typeof payload.city === 'string') {
        enrichment.city = payload.city;
      }
      if (!enrichment.country && typeof payload.country === 'string') {
        enrichment.country = payload.country;
      }
      if (!enrichment.org && typeof payload.org === 'string') {
        enrichment.org = payload.org;
      }
      if (!enrichment.asn && typeof payload.org === 'string') {
        const asMatch = payload.org.match(/AS\d+/i);
        if (asMatch) {
          enrichment.asn = asMatch[0].toUpperCase();
        }
      }
    } catch {
      // optional source, ignore failures
    }
  }

  if (settings.asnRegistryEnabled && enrichment.asn) {
    try {
      const registry = await axios.get(
        'https://stat.ripe.net/data/as-overview/data.json',
        {
          timeout: 3000,
          validateStatus: () => true,
          params: { resource: enrichment.asn },
        },
      );
      const data = (registry.data as Record<string, unknown>).data as
        | Record<string, unknown>
        | undefined;
      if (!enrichment.org && typeof data?.holder === 'string') {
        enrichment.org = data.holder;
      }
    } catch {
      // optional source, ignore failures
    }
  }

  return enrichment;
};

const fetchWhois = async (target: string): Promise<unknown> => {
  try {
    return (await whois(target)) as unknown;
  } catch {
    return null;
  }
};

const mapReconRow = (row: ReconRow): ReconResult | null => {
  if (!isTargetType(row.type)) {
    return null;
  }

  return {
    id: row.id,
    target: row.target,
    type: row.type,
    dns: parseJsonOrNull(row.dns),
    whois: parseJsonOrNull(row.whois),
    headers: parseJsonOrNull(row.headers),
    createdAt: row.created_at,
  };
};

const getEnrichmentSettings = (): EnrichmentSettings => {
  const db = getDatabase();
  const row = db
    .prepare<[], EnrichmentSettingsRow>(
      `SELECT live_enrichment_enabled, geo_enrichment_enabled, tech_enrichment_enabled,
              shodan_enabled, censys_enabled, virustotal_enabled, abuseipdb_enabled,
              geo_advanced_enabled, asn_registry_enabled, nmap_enabled,
              shodan_api_key, censys_api_id, censys_api_secret, virustotal_api_key,
              abuseipdb_api_key, geoip_api_key, asn_registry_api_key,
              ai_assistant_enabled, ai_api_key, updated_at
       FROM enrichment_settings WHERE id = 1`,
    )
    .get();
  if (!row) {
    return {
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
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    liveEnrichmentEnabled: row.live_enrichment_enabled === 1,
    geoEnrichmentEnabled: row.geo_enrichment_enabled === 1,
    techEnrichmentEnabled: row.tech_enrichment_enabled === 1,
    shodanEnabled: row.shodan_enabled === 1,
    censysEnabled: row.censys_enabled === 1,
    virusTotalEnabled: row.virustotal_enabled === 1,
    abuseIpDbEnabled: row.abuseipdb_enabled === 1,
    geoAdvancedEnabled: row.geo_advanced_enabled === 1,
    asnRegistryEnabled: row.asn_registry_enabled === 1,
    nmapEnabled: row.nmap_enabled === 1,
    shodanApiKey: row.shodan_api_key ?? '',
    censysApiId: row.censys_api_id ?? '',
    censysApiSecret: row.censys_api_secret ?? '',
    virusTotalApiKey: row.virustotal_api_key ?? '',
    abuseIpDbApiKey: row.abuseipdb_api_key ?? '',
    geoIpApiKey: row.geoip_api_key ?? '',
    asnRegistryApiKey: row.asn_registry_api_key ?? '',
    aiAssistantEnabled: row.ai_assistant_enabled === 1,
    aiApiKey: row.ai_api_key ?? '',
    updatedAt: row.updated_at,
  };
};

export const getStoredEnrichmentSettings = (): EnrichmentSettings => getEnrichmentSettings();

export const updateEnrichmentSettings = (
  payload: Partial<EnrichmentSettings>,
): EnrichmentSettings => {
  const db = getDatabase();
  const current = getEnrichmentSettings();
  const next: EnrichmentSettings = {
    liveEnrichmentEnabled:
      payload.liveEnrichmentEnabled ?? current.liveEnrichmentEnabled,
    geoEnrichmentEnabled:
      payload.geoEnrichmentEnabled ?? current.geoEnrichmentEnabled,
    techEnrichmentEnabled:
      payload.techEnrichmentEnabled ?? current.techEnrichmentEnabled,
    shodanEnabled: payload.shodanEnabled ?? current.shodanEnabled,
    censysEnabled: payload.censysEnabled ?? current.censysEnabled,
    virusTotalEnabled: payload.virusTotalEnabled ?? current.virusTotalEnabled,
    abuseIpDbEnabled: payload.abuseIpDbEnabled ?? current.abuseIpDbEnabled,
    geoAdvancedEnabled: payload.geoAdvancedEnabled ?? current.geoAdvancedEnabled,
    asnRegistryEnabled: payload.asnRegistryEnabled ?? current.asnRegistryEnabled,
    nmapEnabled: payload.nmapEnabled ?? current.nmapEnabled,
    shodanApiKey: payload.shodanApiKey ?? current.shodanApiKey,
    censysApiId: payload.censysApiId ?? current.censysApiId,
    censysApiSecret: payload.censysApiSecret ?? current.censysApiSecret,
    virusTotalApiKey: payload.virusTotalApiKey ?? current.virusTotalApiKey,
    abuseIpDbApiKey: payload.abuseIpDbApiKey ?? current.abuseIpDbApiKey,
    geoIpApiKey: payload.geoIpApiKey ?? current.geoIpApiKey,
    asnRegistryApiKey: payload.asnRegistryApiKey ?? current.asnRegistryApiKey,
    aiAssistantEnabled: payload.aiAssistantEnabled ?? current.aiAssistantEnabled,
    aiApiKey: payload.aiApiKey ?? current.aiApiKey,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE enrichment_settings
     SET live_enrichment_enabled = ?,
         geo_enrichment_enabled = ?,
         tech_enrichment_enabled = ?,
         shodan_enabled = ?,
         censys_enabled = ?,
         virustotal_enabled = ?,
         abuseipdb_enabled = ?,
         geo_advanced_enabled = ?,
         asn_registry_enabled = ?,
         nmap_enabled = ?,
         shodan_api_key = ?,
         censys_api_id = ?,
         censys_api_secret = ?,
         virustotal_api_key = ?,
         abuseipdb_api_key = ?,
         geoip_api_key = ?,
         asn_registry_api_key = ?,
         ai_assistant_enabled = ?,
         ai_api_key = ?,
         updated_at = ?
     WHERE id = 1`,
  ).run(
    next.liveEnrichmentEnabled ? 1 : 0,
    next.geoEnrichmentEnabled ? 1 : 0,
    next.techEnrichmentEnabled ? 1 : 0,
    next.shodanEnabled ? 1 : 0,
    next.censysEnabled ? 1 : 0,
    next.virusTotalEnabled ? 1 : 0,
    next.abuseIpDbEnabled ? 1 : 0,
    next.geoAdvancedEnabled ? 1 : 0,
    next.asnRegistryEnabled ? 1 : 0,
    next.nmapEnabled ? 1 : 0,
    next.shodanApiKey,
    next.censysApiId,
    next.censysApiSecret,
    next.virusTotalApiKey,
    next.abuseIpDbApiKey,
    next.geoIpApiKey,
    next.asnRegistryApiKey,
    next.aiAssistantEnabled ? 1 : 0,
    next.aiApiKey,
    next.updatedAt,
  );
  return next;
};

const buildScanContextPrompt = (scan: ReconResult, relations: RelationContextRow[]): string => {
  const relationLines = relations
    .slice(0, 16)
    .map(
      (relation) =>
        `- ${relation.source_value} (${relation.source_type}) -> ${relation.target_value} (${relation.target_type}) [${relation.relation_type}] confidence=${relation.confidence.toFixed(2)} weight=${relation.weight}`,
    )
    .join('\n');

  return `
You are a cybersecurity OSINT analyst assistant.
Analyze this new scan and provide concise actionable insights.

Scan:
- target: ${scan.target}
- type: ${scan.type}
- createdAt: ${scan.createdAt}

Detected relations around this scan:
${relationLines || '- No relation detected yet.'}

Instructions:
1) Give a short risk summary (low/medium/high + why).
2) List 3 to 5 notable findings.
3) Suggest 3 next investigation steps.
Keep the answer concise and structured with bullet points.
  `.trim();
};

export const analyzeScanWithAiAssistant = async (scanId: number): Promise<AiScanAnalysis> => {
  const settings = getEnrichmentSettings();
  if (!settings.aiAssistantEnabled) {
    throw new Error('AI assistant is disabled');
  }
  if (!settings.aiApiKey.trim()) {
    throw new Error('AI API key is missing');
  }

  const db = getDatabase();
  const scanRow = db
    .prepare<[number], ReconRow>(
      `SELECT id, target, type, dns, whois, headers, created_at
       FROM recon_results
       WHERE id = ?`,
    )
    .get(scanId);
  const scan = scanRow ? mapReconRow(scanRow) : null;
  if (!scan) {
    throw new Error('Scan not found');
  }

  const relations = db
    .prepare<[number], RelationContextRow>(
      `SELECT r.type AS relation_type,
              COALESCE(r.confidence, 0.6) AS confidence,
              COALESCE(r.weight, 1) AS weight,
              s.value AS source_value,
              s.type AS source_type,
              t.value AS target_value,
              t.type AS target_type
       FROM relations r
       JOIN targets s ON s.id = r.source_id
       JOIN targets t ON t.id = r.target_id
       WHERE r.scan_id = ?
       ORDER BY r.confidence DESC, r.weight DESC
       LIMIT 40`,
    )
    .all(scanId);

  const prompt = buildScanContextPrompt(scan, relations);
  const requestPayload = {
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: 'You are an expert SOC/OSINT assistant focused on concise, actionable threat analysis.',
      },
      { role: 'user', content: prompt },
    ],
  };
  const requestConfig = {
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${settings.aiApiKey}`,
      'Content-Type': 'application/json',
    },
  };

  let completion;
  try {
    completion = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      requestPayload,
      requestConfig,
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 429) {
        const retryAfterHeader = error.response?.headers?.['retry-after'];
        const retryAfterSeconds = Number(retryAfterHeader ?? 0);
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, 8000)
          : 1500;

        // A short retry helps when burst-limited but avoids long UI freezes.
        await wait(retryAfterMs);
        try {
          completion = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            requestPayload,
            requestConfig,
          );
        } catch (retryError) {
          if (axios.isAxiosError(retryError) && retryError.response?.status === 429) {
            throw new Error(
              'OpenAI rate limit or quota reached (429). Wait a moment, then retry, or check plan/billing.',
            );
          }
          throw new Error('OpenAI request failed after retry.');
        }
      } else if (status === 401) {
        throw new Error('Invalid OpenAI API key. Update it in Parametre.');
      } else {
        throw new Error(`OpenAI request failed (${status ?? 'network'}).`);
      }
    }
    throw new Error('AI analysis request failed.');
  }

  const analysis =
    (completion.data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
      ?.message?.content?.trim() ?? 'No analysis generated.';

  return {
    scanId,
    analysis,
    model: 'gpt-4o-mini',
    generatedAt: new Date().toISOString(),
  };
};

const persistReconResult = (
  target: string,
  type: TargetType,
  dnsData: unknown,
  whoisData: unknown,
  headersData: unknown,
): ReconResult => {
  const db = getDatabase();
  const result = db
    .prepare<[string, string, string, string, string]>(
      `INSERT INTO recon_results (target, type, dns, whois, headers)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      target,
      type,
      JSON.stringify(dnsData),
      JSON.stringify(whoisData),
      JSON.stringify(headersData),
    );

  const row = db
    .prepare<[number], ReconRow>(
      `SELECT id, target, type, dns, whois, headers, created_at
       FROM recon_results WHERE id = ?`,
    )
    .get(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error('Unable to save recon result');
  }

  const mapped = mapReconRow(row);
  if (!mapped) {
    throw new Error('Unable to map recon result');
  }

  return mapped;
};

const persistArtifacts = (scanId: number, artifacts: ScanArtifact[]): void => {
  if (artifacts.length === 0) {
    return;
  }
  const db = getDatabase();
  const insert = db.prepare(
    `INSERT INTO scan_artifacts (
      scan_id,
      artifact_type,
      value,
      confidence,
      source,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertMany = db.transaction((items: ScanArtifact[]) => {
    items.forEach((artifact) => {
      insert.run(
        scanId,
        artifact.artifactType,
        artifact.value,
        artifact.confidence,
        artifact.source,
        JSON.stringify(artifact.metadata),
      );
    });
  });
  insertMany(artifacts);
};

const extractTechFromHeaders = (headersData: unknown): string[] => {
  if (!headersData || typeof headersData !== 'object') {
    return [];
  }
  const root = headersData as Record<string, unknown>;
  const headers =
    typeof root.headers === 'object' && root.headers
      ? (root.headers as Record<string, unknown>)
      : root;
  const knownHeaders = ['server', 'x-powered-by', 'via', 'x-generator'];
  const values = knownHeaders
    .map((key) => headers[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.toLowerCase());
  return [...new Set(values)];
};

const extractTlsSummary = (headersData: unknown): TlsCertificateSummary | null => {
  if (!headersData || typeof headersData !== 'object') {
    return null;
  }
  const maybeTls = (headersData as Record<string, unknown>).tls;
  if (!maybeTls || typeof maybeTls !== 'object') {
    return null;
  }
  return maybeTls as TlsCertificateSummary;
};

const createReverseWhoisLocalCorrelations = (
  sourceId: number,
  sourceType: TargetType,
  pivotValues: string[],
  pivotType: 'email' | 'registrar',
  scanId: number,
): void => {
  if (pivotValues.length === 0) {
    return;
  }
  const db = getDatabase();
  const query = db.prepare<
    [string, string],
    { source_id: number }
  >(
    `SELECT DISTINCT r.source_id
     FROM relations r
     JOIN targets t ON t.id = r.target_id
     JOIN targets s ON s.id = r.source_id
     WHERE t.value = ?
       AND t.type = ?
       AND s.type IN ('domain', 'nameserver', 'mx')
     LIMIT 30`,
  );
  pivotValues.forEach((value) => {
    const relatedSourceIds = query.all(value, pivotType);
    relatedSourceIds.forEach((row) => {
      if (row.source_id === sourceId) {
        return;
      }
      createRelation(sourceId, row.source_id, `${sourceType}->local-whois-correlation`, {
        confidence: 0.62,
        source: 'passive',
        scanId,
        evidence: [`reverse-whois:${pivotType}`],
      });
    });
  });
};

const buildGraphRelations = (
  sourceTarget: string,
  sourceType: TargetType,
  dnsData: unknown,
  whoisData: unknown,
  headersData: unknown,
  liveEnrichment: LiveIpEnrichment | null,
  scanId: number,
): void => {
  const source = createTarget(sourceTarget, sourceType);
  const artifacts: ScanArtifact[] = [];
  const dnsRecord = (dnsData ?? {}) as Partial<DnsResult>;
  const tlsSummary = extractTlsSummary(headersData);
  const isDomainLike =
    source.type === 'domain' || source.type === 'nameserver' || source.type === 'mx';

  if (source.type === 'url') {
    const host = parseUrlHostname(sourceTarget);
    if (host) {
      const hostType: TargetType = isIP(host) === 0 ? 'domain' : 'ip';
      const hostNode = createTarget(host, hostType);
      createRelation(source.id, hostNode.id, 'url->host', {
        confidence: 0.86,
        source: 'passive',
        scanId,
        evidence: ['url:hostname'],
      });
    }
  }

  if (isDomainLike || source.type === 'domain') {
    const ips = [...(dnsRecord.a ?? []), ...(dnsRecord.aaaa ?? [])];
    const uniqueIps = [...new Set(ips)];
    uniqueIps.forEach((ip) => {
      const ipNode = createTarget(ip, 'ip');
      createRelation(source.id, ipNode.id, `${source.type}->ip`, {
        confidence: 0.9,
        source: 'passive',
        scanId,
        evidence: ['dns:a', 'dns:aaaa'],
      });
      artifacts.push({
        artifactType: 'ip',
        value: ip,
        confidence: 0.9,
        source: 'passive',
        metadata: { relation: `${source.type}->ip` },
      });
    });

    const nameservers = [...new Set(dnsRecord.ns ?? [])];
    nameservers.forEach((ns) => {
      const nsNode = createTarget(ns, 'nameserver');
      createRelation(source.id, nsNode.id, `${source.type}->ns`, {
        confidence: 0.8,
        source: 'passive',
        scanId,
        evidence: ['dns:ns'],
      });
      artifacts.push({
        artifactType: 'nameserver',
        value: ns,
        confidence: 0.8,
        source: 'passive',
        metadata: { relation: `${source.type}->ns` },
      });
    });

    const mailServers = [...new Set(dnsRecord.mx ?? [])];
    mailServers.forEach((mx) => {
      const mxNode = createTarget(mx, 'mx');
      createRelation(source.id, mxNode.id, `${source.type}->mx`, {
        confidence: 0.75,
        source: 'passive',
        scanId,
        evidence: ['dns:mx'],
      });
      artifacts.push({
        artifactType: 'mx',
        value: mx,
        confidence: 0.75,
        source: 'passive',
        metadata: { relation: `${source.type}->mx` },
      });
    });

    const subdomains = extractSubdomainsFromDns(sourceTarget, {
      a: dnsRecord.a ?? [],
      aaaa: dnsRecord.aaaa ?? [],
      mx: dnsRecord.mx ?? [],
      ns: dnsRecord.ns ?? [],
      txt: dnsRecord.txt ?? [],
      cname: dnsRecord.cname ?? [],
      ptr: dnsRecord.ptr ?? [],
      soa: dnsRecord.soa ?? [],
      caa: dnsRecord.caa ?? [],
      dnskey: dnsRecord.dnskey ?? [],
      ds: dnsRecord.ds ?? [],
      dmarc: dnsRecord.dmarc ?? [],
      dkim: dnsRecord.dkim ?? [],
      spf: dnsRecord.spf ?? [],
    });
    subdomains.forEach((subdomain) => {
      const subdomainNode = createTarget(subdomain, 'subdomain');
      createRelation(source.id, subdomainNode.id, `${source.type}->subdomain`, {
        confidence: 0.7,
        source: 'passive',
        scanId,
        evidence: ['dns:cname', 'dns:ptr'],
      });
      artifacts.push({
        artifactType: 'subdomain',
        value: subdomain,
        confidence: 0.7,
        source: 'passive',
        metadata: { relation: `${source.type}->subdomain` },
      });
    });

    [...new Set(dnsRecord.spf ?? [])].forEach((spfRecord) => {
      const spfNode = createTarget(spfRecord, 'spf');
      createRelation(source.id, spfNode.id, `${source.type}->spf`, {
        confidence: 0.78,
        source: 'passive',
        scanId,
        evidence: ['dns:spf'],
      });
    });
    [...new Set(dnsRecord.dmarc ?? [])].forEach((dmarcRecord) => {
      const dmarcNode = createTarget(dmarcRecord, 'dmarc');
      createRelation(source.id, dmarcNode.id, `${source.type}->dmarc`, {
        confidence: 0.83,
        source: 'passive',
        scanId,
        evidence: ['dns:dmarc'],
      });
    });
    [...new Set(dnsRecord.dkim ?? [])].forEach((dkimRecord) => {
      const dkimNode = createTarget(dkimRecord, 'dkim');
      createRelation(source.id, dkimNode.id, `${source.type}->dkim`, {
        confidence: 0.7,
        source: 'passive',
        scanId,
        evidence: ['dns:dkim'],
      });
    });
    if ((dnsRecord.dnskey?.length ?? 0) > 0 || (dnsRecord.ds?.length ?? 0) > 0) {
      const dnssecNode = createTarget('dnssec-enabled', 'tech');
      createRelation(source.id, dnssecNode.id, `${source.type}->tech`, {
        confidence: 0.8,
        source: 'passive',
        scanId,
        evidence: ['dns:dnskey', 'dns:ds'],
      });
    }
    [...new Set(dnsRecord.soa ?? [])].forEach((soaRecord) => {
      const soaNode = createTarget(`soa:${soaRecord}`, 'tech');
      createRelation(source.id, soaNode.id, `${source.type}->tech`, {
        confidence: 0.66,
        source: 'passive',
        scanId,
        evidence: ['dns:soa'],
      });
    });
    [...new Set(dnsRecord.caa ?? [])].forEach((caaRecord) => {
      const caaNode = createTarget(`caa:${caaRecord}`, 'tech');
      createRelation(source.id, caaNode.id, `${source.type}->tech`, {
        confidence: 0.68,
        source: 'passive',
        scanId,
        evidence: ['dns:caa'],
      });
    });

    if (tlsSummary?.subjectCN) {
      const certNode = createTarget(tlsSummary.subjectCN, 'certificate');
      createRelation(source.id, certNode.id, `${source.type}->certificate`, {
        confidence: 0.82,
        source: 'passive',
        scanId,
        evidence: ['tls:subject-cn'],
      });
      if (tlsSummary.issuerCN) {
        const issuerNode = createTarget(tlsSummary.issuerCN, 'tls_issuer');
        createRelation(certNode.id, issuerNode.id, 'certificate->issuer', {
          confidence: 0.85,
          source: 'passive',
          scanId,
          evidence: ['tls:issuer'],
        });
      }
    }
  }

  if (source.type === 'ip') {
    const domains = [...new Set(dnsRecord.ptr ?? [])];
    domains.forEach((domain) => {
      const domainNode = createTarget(domain, 'domain');
      createRelation(source.id, domainNode.id, 'ip->domain', {
        confidence: 0.85,
        source: 'passive',
        scanId,
        evidence: ['dns:ptr'],
      });
      artifacts.push({
        artifactType: 'domain',
        value: domain,
        confidence: 0.85,
        source: 'passive',
        metadata: { relation: 'ip->domain' },
      });
    });

    const cidr = liveEnrichment?.cidr ?? deriveCidr(sourceTarget);
    if (cidr) {
      const cidrNode = createTarget(cidr, 'cidr');
      createRelation(source.id, cidrNode.id, 'ip->cidr', {
        confidence: 0.8,
        source: liveEnrichment ? 'live' : 'passive',
        scanId,
        evidence: ['cidr:derived'],
      });
      artifacts.push({
        artifactType: 'cidr',
        value: cidr,
        confidence: 0.8,
        source: liveEnrichment ? 'live' : 'passive',
        metadata: { relation: 'ip->cidr' },
      });
    }
    if (liveEnrichment?.asn) {
      const asnNode = createTarget(liveEnrichment.asn, 'asn');
      createRelation(source.id, asnNode.id, 'ip->asn', {
        confidence: 0.8,
        source: 'live',
        scanId,
        evidence: ['ipwhois:asn'],
      });
    }
    if (liveEnrichment?.org) {
      const orgNode = createTarget(liveEnrichment.org, 'org');
      createRelation(source.id, orgNode.id, 'ip->org', {
        confidence: 0.78,
        source: 'live',
        scanId,
        evidence: ['ipwhois:org'],
      });
    }
    if (liveEnrichment?.country) {
      const countryNode = createTarget(liveEnrichment.country, 'country');
      createRelation(source.id, countryNode.id, 'ip->country', {
        confidence: 0.75,
        source: 'live',
        scanId,
        evidence: ['ipwhois:country'],
      });
    }
    if (liveEnrichment?.city) {
      const cityNode = createTarget(liveEnrichment.city, 'city');
      createRelation(source.id, cityNode.id, 'ip->city', {
        confidence: 0.7,
        source: 'live',
        scanId,
        evidence: ['ipwhois:city'],
      });
    }
    (liveEnrichment?.ports ?? []).forEach((port) => {
      const portNode = createTarget(port, 'port');
      createRelation(source.id, portNode.id, 'ip->port', {
        confidence: 0.74,
        source: 'live',
        scanId,
        evidence: ['live:ports'],
      });
    });
    (liveEnrichment?.services ?? []).forEach((service) => {
      const serviceNode = createTarget(service, 'service');
      createRelation(source.id, serviceNode.id, 'ip->service', {
        confidence: 0.72,
        source: 'live',
        scanId,
        evidence: ['live:service'],
      });
    });
    if (liveEnrichment?.os) {
      const osNode = createTarget(liveEnrichment.os, 'os');
      createRelation(source.id, osNode.id, 'ip->os', {
        confidence: 0.7,
        source: 'live',
        scanId,
        evidence: ['live:os'],
      });
    }
  }

  (liveEnrichment?.nmapHosts ?? []).forEach((host) => {
    applyPortEnrichmentToIpNode(host.ip, host, scanId, 'nmap');
  });

  if (source.type === 'cidr') {
    const prefix = sourceTarget.split('/')[0];
    if (prefix && isIP(prefix)) {
      const ipNode = createTarget(prefix, 'ip');
      createRelation(source.id, ipNode.id, 'cidr->ip', {
        confidence: 0.68,
        source: 'passive',
        scanId,
        evidence: ['cidr:prefix'],
      });
    }
  }

  if (source.type === 'asn') {
    const orgValues = extractWhoisValue(whoisData, ['org', 'organisation', 'owner']);
    orgValues.forEach((org) => {
      const orgNode = createTarget(org, 'org');
      createRelation(source.id, orgNode.id, 'asn->org', {
        confidence: 0.73,
        source: 'passive',
        scanId,
        evidence: ['whois:org'],
      });
    });
  }

  const emails = extractEmailsFromObject(whoisData);
  emails.forEach((email) => {
    const emailNode = createTarget(email, 'email');
    if (isDomainLike || source.type === 'domain') {
      createRelation(source.id, emailNode.id, `${source.type}->email`, {
        confidence: 0.82,
        source: 'passive',
        scanId,
        evidence: ['whois:email'],
      });
      return;
    }
    createRelation(source.id, emailNode.id, 'ip->email', {
      confidence: 0.78,
      source: 'passive',
      scanId,
      evidence: ['whois:email'],
    });
  });

  const phones = extractPhonesFromObject(whoisData);
  phones.forEach((phone) => {
    const phoneNode = createTarget(phone, 'phone');
    createRelation(source.id, phoneNode.id, `${source.type}->phone`, {
      confidence: 0.7,
      source: 'passive',
      scanId,
      evidence: ['whois:phone'],
    });
  });

  const registrarValues = extractWhoisValue(whoisData, ['registrar', 'sponsoring']);
  registrarValues.forEach((registrar) => {
    const registrarNode = createTarget(registrar, 'registrar');
    createRelation(source.id, registrarNode.id, `${source.type}->registrar`, {
      confidence: 0.72,
      source: 'passive',
      scanId,
      evidence: ['whois:registrar'],
    });
  });

  if (isDomainLike || source.type === 'domain') {
    const typedSource =
      source.type === 'domain' || source.type === 'nameserver' || source.type === 'mx'
        ? source.type
        : sourceType;
    createReverseWhoisLocalCorrelations(source.id, typedSource, emails, 'email', scanId);
    createReverseWhoisLocalCorrelations(
      source.id,
      typedSource,
      registrarValues,
      'registrar',
      scanId,
    );
  }

  const techValues = extractTechFromHeaders(headersData);
  techValues.forEach((tech) => {
    const techNode = createTarget(tech, 'tech');
    createRelation(source.id, techNode.id, `${source.type}->tech`, {
      confidence: 0.65,
      source: 'passive',
      scanId,
      evidence: ['headers:technology'],
    });
  });

  if (
    source.type === 'domain' ||
    source.type === 'ip' ||
    source.type === 'email' ||
    source.type === 'nameserver' ||
    source.type === 'mx'
  ) {
    const urlNode = createTarget(buildTargetUrl(sourceTarget, source.type), 'url');
    createRelation(source.id, urlNode.id, `${source.type}->url`, {
      confidence: 0.6,
      source: 'passive',
      scanId,
      evidence: ['scan:url'],
    });
  }

  persistArtifacts(scanId, artifacts);
};

const withLiveEnrichmentIfEnabled = async (
  target: string,
  type: TargetType,
): Promise<LiveIpEnrichment | null> => {
  if (type !== 'ip') {
    return null;
  }
  const settings = getEnrichmentSettings();
  let enrichment: LiveIpEnrichment = {};

  if (settings.liveEnrichmentEnabled) {
    enrichment = await fetchLiveIpEnrichment(target, settings);
  } else {
    const derived = deriveCidr(target);
    if (derived) {
      enrichment.cidr = derived;
    }
  }

  if (settings.nmapEnabled) {
    const nmapResult = await runNmapScan(target);
    mergeNmapIntoEnrichment(enrichment, nmapResult);
  }

  return enrichment;
};

const collectNmapForDnsIps = async (
  dnsData: unknown,
): Promise<NmapHostResult[]> => {
  const settings = getEnrichmentSettings();
  if (!settings.nmapEnabled || !dnsData || typeof dnsData !== 'object') {
    return [];
  }
  const dnsRecord = dnsData as Partial<DnsResult>;
  const ips = [...new Set([...(dnsRecord.a ?? []), ...(dnsRecord.aaaa ?? [])])].slice(
    0,
    3,
  );
  const results: NmapHostResult[] = [];
  for (const ip of ips) {
    const result = await runNmapScan(ip);
    if (result.ports.length > 0 || result.services.length > 0 || result.os) {
      results.push(result);
    }
  }
  return results;
};

const extractLiveEnrichmentFromStoredWhois = (
  whoisData: unknown,
): LiveIpEnrichment | null => {
  if (!whoisData || typeof whoisData !== 'object') {
    return null;
  }
  const record = whoisData as Record<string, unknown>;
  if (!record.live || typeof record.live !== 'object') {
    return null;
  }
  return record.live as LiveIpEnrichment;
};

const normalizeScanTarget = (target: string, type: TargetType): string => {
  const trimmed = target.trim();
  if (type === 'domain' || type === 'email' || type === 'nameserver' || type === 'mx') {
    return trimmed.toLowerCase();
  }
  if (type === 'asn') {
    const normalized = trimmed.toUpperCase();
    return normalized.startsWith('AS') ? normalized : `AS${normalized}`;
  }
  if (type === 'url') {
    return trimmed;
  }
  if (type === 'cidr') {
    return trimmed.toLowerCase();
  }
  return trimmed;
};

const appendLiveDataToWhois = (
  whoisData: unknown,
  liveEnrichment: LiveIpEnrichment | null,
): unknown => {
  if (!liveEnrichment) {
    return whoisData;
  }
  return {
    whois: whoisData,
    live: liveEnrichment,
  };
};

const upsertNodeAttributes = (source: TargetType, whoisData: unknown): void => {
  const db = getDatabase();
  const insert = db.prepare(
    `INSERT INTO node_attributes (target_id, attribute_key, attribute_value, confidence, source)
     SELECT id, ?, ?, ?, ?
     FROM targets
     WHERE value = ? AND type = ?
     ON CONFLICT(target_id, attribute_key, attribute_value)
     DO UPDATE SET confidence = excluded.confidence, source = excluded.source, updated_at = CURRENT_TIMESTAMP`,
  );
  const registrarValues = extractWhoisValue(whoisData, ['registrar', 'sponsoring']);
  registrarValues.forEach((registrar) => {
    insert.run('registrar', registrar, 0.7, 'passive', registrar, source);
  });
};

const rebuildGraphFromHistory = (): void => {
  const db = getDatabase();
  const rows = db
    .prepare<[], ReconRow>(
      `SELECT id, target, type, dns, whois, headers, created_at
       FROM recon_results`,
    )
    .all();

  clearGraph();
  rows.forEach((row) => {
    if (!isTargetType(row.type)) {
      return;
    }

    const whoisData = parseJsonOrNull(row.whois);
    buildGraphRelations(
      row.target,
      row.type,
      parseJsonOrNull(row.dns),
      whoisData,
      parseJsonOrNull(row.headers),
      extractLiveEnrichmentFromStoredWhois(whoisData),
      row.id,
    );
  });
};

export const syncGraphFromHistory = (): void => {
  rebuildGraphFromHistory();
};

export const scanTarget = async (
  target: string,
  type: TargetType,
): Promise<ReconResult> => {
  const normalizedTarget = normalizeScanTarget(target, type);
  if (type === 'ip' && isIP(normalizedTarget) === 0) {
    throw new Error('Invalid IP target');
  }
  if (type === 'email' && !normalizedTarget.includes('@')) {
    throw new Error('Invalid email target');
  }
  if (type === 'cidr' && !isValidCidr(normalizedTarget)) {
    throw new Error('Invalid CIDR target');
  }
  if (type === 'asn' && !isValidAsn(normalizedTarget)) {
    throw new Error('Invalid ASN target');
  }

  const hostForDns =
    type === 'url'
      ? parseUrlHostname(normalizedTarget)
      : type === 'domain' || type === 'nameserver' || type === 'mx'
      ? normalizedTarget
      : null;
  if (type === 'url' && !hostForDns) {
    throw new Error('Invalid URL target');
  }

  const dnsData =
    hostForDns
      ? await collectDnsRecords(hostForDns)
      : type === 'ip'
      ? await collectIpRecords(normalizedTarget)
      : null;
  const whoisTarget =
    type === 'url' && hostForDns ? hostForDns : normalizedTarget;
  const whoisData = await fetchWhois(whoisTarget);
  let liveEnrichment = await withLiveEnrichmentIfEnabled(normalizedTarget, type);

  if (type === 'domain' || type === 'url' || type === 'nameserver' || type === 'mx') {
    const nmapHosts = await collectNmapForDnsIps(dnsData);
    if (nmapHosts.length > 0) {
      liveEnrichment = {
        ...(liveEnrichment ?? {}),
        nmapHosts,
      };
    }
  }

  const mergedWhois = appendLiveDataToWhois(whoisData, liveEnrichment);
  const headersData = await fetchHeaders(normalizedTarget, type);
  const tlsSummary =
    hostForDns && isIP(hostForDns) === 0 ? await fetchTlsCertificate(hostForDns) : null;
  const mergedHeaders =
    tlsSummary || headersData
      ? {
          headers: headersData,
          tls: tlsSummary,
        }
      : headersData;

  const reconResult = persistReconResult(
    normalizedTarget,
    type,
    dnsData,
    mergedWhois,
    mergedHeaders,
  );

  buildGraphRelations(
    normalizedTarget,
    type,
    dnsData,
    mergedWhois,
    mergedHeaders,
    liveEnrichment,
    reconResult.id,
  );
  upsertNodeAttributes(type, mergedWhois);
  return reconResult;
};

export const getHistory = (): ReconResult[] => {
  const db = getDatabase();
  const rows = db
    .prepare<[], ReconRow>(
      `SELECT id, target, type, dns, whois, headers, created_at
       FROM recon_results
       ORDER BY datetime(created_at) DESC`,
    )
    .all();

  return rows
    .map((row) => mapReconRow(row))
    .filter((row): row is ReconResult => row !== null);
};

export const deleteScanById = (id: number): boolean => {
  const db = getDatabase();
  const transaction = db.transaction((scanId: number) => {
    db.prepare<[number]>('DELETE FROM scan_artifacts WHERE scan_id = ?').run(scanId);
    return db
      .prepare<[number]>('DELETE FROM recon_results WHERE id = ?')
      .run(scanId);
  });
  const result = transaction(id);

  if (result.changes > 0) {
    rebuildGraphFromHistory();
  }

  return result.changes > 0;
};

export const clearHistory = (): number => {
  const db = getDatabase();
  const result = db.transaction(() => {
    db.prepare('DELETE FROM scan_artifacts').run();
    return db.prepare('DELETE FROM recon_results').run();
  })();
  clearGraph();
  return result.changes;
};
