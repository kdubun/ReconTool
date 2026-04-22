import axios from 'axios';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import whois from 'whois-json';
import { getDatabase } from '@main/database/init';
import {
  clearGraph,
  createRelation,
  createTarget,
} from '@main/services/graph.service';
import type { EnrichmentSettings, GraphSourceType, ReconResult, TargetType } from '@shared/types';

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
};

type EnrichmentSettingsRow = {
  live_enrichment_enabled: number;
  geo_enrichment_enabled: number;
  tech_enrichment_enabled: number;
  updated_at: string;
};

type LiveIpEnrichment = {
  asn?: string;
  org?: string;
  country?: string;
  city?: string;
  cidr?: string;
};

type ScanArtifact = {
  artifactType: string;
  value: string;
  confidence: number;
  source: GraphSourceType;
  metadata: Record<string, unknown>;
};

const isTargetType = (value: string): value is TargetType =>
  value === 'domain' || value === 'ip' || value === 'email';

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
  const [a, aaaa, mx, ns, txt, cname] = await Promise.all([
    resolveSafe(() => dns.resolve4(domain), [] as string[]),
    resolveSafe(() => dns.resolve6(domain), [] as string[]),
    resolveSafe(() => dns.resolveMx(domain), [] as dns.MxRecord[]),
    resolveSafe(() => dns.resolveNs(domain), [] as string[]),
    resolveSafe(() => dns.resolveTxt(domain), [] as string[][]),
    resolveSafe(() => dns.resolveCname(domain), [] as string[]),
  ]);

  return {
    a,
    aaaa,
    mx: mx.map((record) => record.exchange),
    ns,
    txt: txt.map((entry) => entry.join(' ')),
    cname,
    ptr: [],
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
  };
};

const formatHostForUrl = (target: string, type: TargetType): string => {
  if (type !== 'ip') {
    return target;
  }
  return isIP(target) === 6 ? `[${target}]` : target;
};

const buildTargetUrl = (target: string, type: TargetType): string => {
  if (type === 'domain') {
    return `https://${target}`;
  }
  if (type === 'ip') {
    return `http://${formatHostForUrl(target, type)}`;
  }
  const domain = target.split('@')[1] ?? '';
  return `https://${domain}`;
};

const fetchHeaders = async (target: string, type: TargetType): Promise<unknown> => {
  const url = buildTargetUrl(target, type);

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

const fetchLiveIpEnrichment = async (ip: string): Promise<LiveIpEnrichment> => {
  try {
    const response = await axios.get(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      timeout: 3500,
      validateStatus: () => true,
    });
    const payload = response.data as Record<string, unknown>;
    return {
      asn: typeof payload.connection === 'object' && payload.connection
        ? String((payload.connection as Record<string, unknown>).asn ?? '')
        : undefined,
      org: typeof payload.connection === 'object' && payload.connection
        ? String((payload.connection as Record<string, unknown>).org ?? '')
        : undefined,
      country: typeof payload.country === 'string' ? payload.country : undefined,
      city: typeof payload.city === 'string' ? payload.city : undefined,
      cidr: deriveCidr(ip),
    };
  } catch {
    return { cidr: deriveCidr(ip) };
  }
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
      `SELECT live_enrichment_enabled, geo_enrichment_enabled, tech_enrichment_enabled, updated_at
       FROM enrichment_settings WHERE id = 1`,
    )
    .get();
  if (!row) {
    return {
      liveEnrichmentEnabled: false,
      geoEnrichmentEnabled: false,
      techEnrichmentEnabled: false,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    liveEnrichmentEnabled: row.live_enrichment_enabled === 1,
    geoEnrichmentEnabled: row.geo_enrichment_enabled === 1,
    techEnrichmentEnabled: row.tech_enrichment_enabled === 1,
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
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE enrichment_settings
     SET live_enrichment_enabled = ?,
         geo_enrichment_enabled = ?,
         tech_enrichment_enabled = ?,
         updated_at = ?
     WHERE id = 1`,
  ).run(
    next.liveEnrichmentEnabled ? 1 : 0,
    next.geoEnrichmentEnabled ? 1 : 0,
    next.techEnrichmentEnabled ? 1 : 0,
    next.updatedAt,
  );
  return next;
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
  const headers = headersData as Record<string, unknown>;
  const knownHeaders = ['server', 'x-powered-by', 'via', 'x-generator'];
  const values = knownHeaders
    .map((key) => headers[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.toLowerCase());
  return [...new Set(values)];
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
  if (source.type !== 'domain' && source.type !== 'ip') {
    return;
  }

  const artifacts: ScanArtifact[] = [];
  const dnsRecord = (dnsData ?? {}) as Partial<DnsResult>;
  if (source.type === 'domain') {
    const ips = [...(dnsRecord.a ?? []), ...(dnsRecord.aaaa ?? [])];
    const uniqueIps = [...new Set(ips)];
    uniqueIps.forEach((ip) => {
      const ipNode = createTarget(ip, 'ip');
      createRelation(source.id, ipNode.id, 'domain->ip', {
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
        metadata: { relation: 'domain->ip' },
      });
    });

    const nameservers = [...new Set(dnsRecord.ns ?? [])];
    nameservers.forEach((ns) => {
      const nsNode = createTarget(ns, 'nameserver');
      createRelation(source.id, nsNode.id, 'domain->ns', {
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
        metadata: { relation: 'domain->ns' },
      });
    });

    const mailServers = [...new Set(dnsRecord.mx ?? [])];
    mailServers.forEach((mx) => {
      const mxNode = createTarget(mx, 'mx');
      createRelation(source.id, mxNode.id, 'domain->mx', {
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
        metadata: { relation: 'domain->mx' },
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
    });
    subdomains.forEach((subdomain) => {
      const subdomainNode = createTarget(subdomain, 'subdomain');
      createRelation(source.id, subdomainNode.id, 'domain->subdomain', {
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
        metadata: { relation: 'domain->subdomain' },
      });
    });
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
  }

  const emails = extractEmailsFromObject(whoisData);
  emails.forEach((email) => {
    const emailNode = createTarget(email, 'email');
    if (source.type === 'domain') {
      createRelation(source.id, emailNode.id, 'domain->email', {
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

  if (source.type === 'domain' || source.type === 'ip') {
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
  if (!settings.liveEnrichmentEnabled) {
    return { cidr: deriveCidr(target) };
  }
  return fetchLiveIpEnrichment(target);
};

const normalizeScanTarget = (target: string, type: TargetType): string => {
  const trimmed = target.trim();
  if (type === 'domain' || type === 'email') {
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

    buildGraphRelations(
      row.target,
      row.type,
      parseJsonOrNull(row.dns),
      parseJsonOrNull(row.whois),
      parseJsonOrNull(row.headers),
      null,
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
  const dnsData =
    type === 'domain'
      ? await collectDnsRecords(normalizedTarget)
      : type === 'ip'
      ? await collectIpRecords(normalizedTarget)
      : null;
  const whoisData = await fetchWhois(normalizedTarget);
  const liveEnrichment = await withLiveEnrichmentIfEnabled(normalizedTarget, type);
  const mergedWhois = appendLiveDataToWhois(whoisData, liveEnrichment);
  const headersData = await fetchHeaders(normalizedTarget, type);

  const reconResult = persistReconResult(
    normalizedTarget,
    type,
    dnsData,
    mergedWhois,
    headersData,
  );

  buildGraphRelations(
    normalizedTarget,
    type,
    dnsData,
    mergedWhois,
    headersData,
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
