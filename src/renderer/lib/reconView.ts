import type { ReconResult } from '@shared/types';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => (typeof entry === 'string' ? entry : ''))
      .filter(Boolean)
      .join(' · ');
    return joined || null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
};

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry : asString(entry)))
    .filter((entry): entry is string => Boolean(entry));
};

export const formatClock = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleTimeString([], { hour12: false });
};

export const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString([], { hour12: false });
};

export const maskSecret = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'not configured';
  }
  const tail = trimmed.slice(-4);
  return `••••••••••••••••${tail}`;
};

export const countDnsArtifacts = (dns: unknown): number => {
  if (!isRecord(dns)) {
    return 0;
  }
  return Object.values(dns).reduce<number>(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0,
  );
};

export const extractWhoisEmails = (whois: unknown): string[] => {
  const blob = JSON.stringify(whois ?? {});
  return [...new Set(blob.match(EMAIL_RE) ?? [])];
};

export const hasTls = (headers: unknown): boolean => {
  if (!isRecord(headers)) {
    return false;
  }
  return isRecord(headers.tls);
};

export const summarizeScan = (item: ReconResult): string => {
  const dnsCount = countDnsArtifacts(item.dns);
  const emailCount = extractWhoisEmails(item.whois).length;
  const parts = [`${dnsCount} DNS`, `${emailCount} WHOIS email${emailCount === 1 ? '' : 's'}`];
  if (hasTls(item.headers)) {
    parts.push('TLS ok');
  }
  return parts.join(' · ');
};

export const dnsRowsFromResult = (dns: unknown): Array<{ k: string; v: string }> => {
  if (!isRecord(dns)) {
    return [];
  }
  const keys = ['A', 'AAAA', 'NS', 'MX', 'TXT', 'CNAME', 'PTR', 'SOA', 'CAA'] as const;
  const lookup: Record<(typeof keys)[number], string> = {
    A: 'a',
    AAAA: 'aaaa',
    NS: 'ns',
    MX: 'mx',
    TXT: 'txt',
    CNAME: 'cname',
    PTR: 'ptr',
    SOA: 'soa',
    CAA: 'caa',
  };
  const rows: Array<{ k: string; v: string }> = [];
  keys.forEach((k) => {
    const values = stringList(dns[lookup[k]]);
    if (values.length === 0) {
      return;
    }
    rows.push({ k, v: values.slice(0, 4).join(' · ') });
  });
  return rows;
};

export const whoisRowsFromResult = (whois: unknown): Array<{ k: string; v: string }> => {
  if (!isRecord(whois)) {
    return [];
  }
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = asString(whois[key]);
      if (value) {
        return value;
      }
    }
    return null;
  };
  const emails = extractWhoisEmails(whois);
  const rows: Array<{ k: string; v: string }> = [];
  const registrar = pick('registrar', 'registrarName', 'registrar_name');
  const created = pick('creationDate', 'created', 'createdDate', 'creation_date');
  const updated = pick('updatedDate', 'updated', 'lastUpdated', 'updated_date');
  const expires = pick(
    'expiryDate',
    'registrarRegistrationExpirationDate',
    'expires',
    'expirationDate',
  );
  const status = pick('status', 'domainStatus');
  if (registrar) {
    rows.push({ k: 'Registrar', v: registrar });
  }
  if (created) {
    rows.push({ k: 'Created', v: created });
  }
  if (updated) {
    rows.push({ k: 'Updated', v: updated });
  }
  if (expires) {
    rows.push({ k: 'Expires', v: expires });
  }
  if (status) {
    rows.push({ k: 'Status', v: status });
  }
  if (emails.length > 0) {
    rows.push({ k: 'Contacts', v: emails.slice(0, 4).join(', ') });
  }
  return rows;
};

export type MailStatus = 'pass' | 'partial' | 'weak' | 'missing';

export const mailRowsFromResult = (
  dns: unknown,
): Array<{ k: string; status: MailStatus; v: string }> => {
  const record = isRecord(dns) ? dns : {};
  const spf = stringList(record.spf);
  const dkim = stringList(record.dkim);
  const dmarc = stringList(record.dmarc);

  const spfStatus: MailStatus = spf.length === 0
    ? 'missing'
    : spf.some((entry) => entry.includes('-all'))
      ? 'pass'
      : 'partial';
  const dkimStatus: MailStatus = dkim.length === 0 ? 'missing' : dkim.length > 1 ? 'pass' : 'partial';
  const dmarcJoined = dmarc.join(' ').toLowerCase();
  const dmarcStatus: MailStatus =
    dmarc.length === 0
      ? 'missing'
      : dmarcJoined.includes('p=reject') || dmarcJoined.includes('p=quarantine')
        ? 'pass'
        : 'weak';

  return [
    { k: 'SPF', status: spfStatus, v: spf[0] ?? 'no SPF record' },
    {
      k: 'DKIM',
      status: dkimStatus,
      v: dkim.length > 0 ? `${dkim.length} selector${dkim.length === 1 ? '' : 's'} found` : 'no DKIM',
    },
    { k: 'DMARC', status: dmarcStatus, v: dmarc[0] ?? 'no DMARC record' },
  ];
};

export const tlsRowsFromResult = (headers: unknown): Array<{ k: string; v: string }> => {
  if (!isRecord(headers) || !isRecord(headers.tls)) {
    return [];
  }
  const tls = headers.tls;
  const rows: Array<{ k: string; v: string }> = [];
  const issuer = asString(tls.issuerCN);
  const subject = asString(tls.subjectCN);
  const san = Array.isArray(tls.san) ? tls.san.filter((entry) => typeof entry === 'string').join(', ') : '';
  const from = asString(tls.validFrom);
  const to = asString(tls.validTo);
  if (issuer) {
    rows.push({ k: 'Issuer', v: issuer });
  }
  if (subject) {
    rows.push({ k: 'Subject', v: `CN=${subject}` });
  }
  if (san) {
    rows.push({ k: 'SAN', v: san });
  }
  if (from || to) {
    rows.push({ k: 'Valid', v: `${from ?? '—'} → ${to ?? '—'}` });
  }
  return rows;
};

export const headerRowsFromResult = (headers: unknown): Array<{ k: string; v: string }> => {
  if (!isRecord(headers)) {
    return [];
  }
  const raw = isRecord(headers.headers) ? headers.headers : headers;
  const skip = new Set(['tls']);
  const preferred = [
    'server',
    'status',
    'x-powered-by',
    'strict-transport-security',
    'content-type',
    'cf-ray',
    'via',
    'x-frame-options',
  ];
  const rows: Array<{ k: string; v: string }> = [];
  const seen = new Set<string>();
  const push = (key: string, value: unknown): void => {
    const text = asString(value);
    if (!text || seen.has(key)) {
      return;
    }
    seen.add(key);
    rows.push({ k: key, v: text });
  };
  preferred.forEach((key) => push(key, raw[key]));
  Object.entries(raw).forEach(([key, value]) => {
    if (skip.has(key) || rows.length >= 9) {
      return;
    }
    push(key.toLowerCase(), value);
  });
  return rows;
};
