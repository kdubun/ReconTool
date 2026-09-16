export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter((part): part is string => Boolean(part)).join(' ');
