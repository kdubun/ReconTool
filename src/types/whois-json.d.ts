declare module 'whois-json' {
  export default function whois(
    target: string,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
