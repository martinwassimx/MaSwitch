/**
 * Lightweight, zero-dependency SemVer 2.0.0 utility for MaSwitch updater.
 * Eliminates external runtime node_modules dependency in packaged Electron app.asar.
 */

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  raw: string;
}

const SEMVER_REGEX = /^[vV]?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const COERCE_REGEX = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/;

export function parseSemver(version: string): ParsedSemver | null {
  if (typeof version !== 'string') return null;
  const trimmed = version.trim();
  const match = SEMVER_REGEX.exec(trimmed);
  if (!match) return null;

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);
  const prerelease = match[4] ? match[4].split('.') : [];

  return { major, minor, patch, prerelease, raw: trimmed };
}

export function clean(version: string): string | null {
  const parsed = parseSemver(version);
  if (!parsed) return null;
  const pre = parsed.prerelease.length > 0 ? `-${parsed.prerelease.join('.')}` : '';
  return `${parsed.major}.${parsed.minor}.${parsed.patch}${pre}`;
}

export function coerce(version: string): { version: string } | null {
  if (typeof version !== 'string') return null;
  const match = COERCE_REGEX.exec(version.trim());
  if (!match) return null;
  const major = parseInt(match[1], 10);
  const minor = match[2] !== undefined ? parseInt(match[2], 10) : 0;
  const patch = match[3] !== undefined ? parseInt(match[3], 10) : 0;
  return { version: `${major}.${minor}.${patch}` };
}

export function valid(version: string | null | undefined): string | null {
  if (!version) return null;
  return clean(version);
}

export function compare(a: string, b: string): number {
  const pA = parseSemver(a);
  const pB = parseSemver(b);

  if (!pA && !pB) return 0;
  if (!pA) return -1;
  if (!pB) return 1;

  if (pA.major !== pB.major) return pA.major > pB.major ? 1 : -1;
  if (pA.minor !== pB.minor) return pA.minor > pB.minor ? 1 : -1;
  if (pA.patch !== pB.patch) return pA.patch > pB.patch ? 1 : -1;

  // Prerelease comparison per SemVer 2.0.0
  const aHasPre = pA.prerelease.length > 0;
  const bHasPre = pB.prerelease.length > 0;

  // Normal version has higher precedence than prerelease: 1.0.0 > 1.0.0-beta
  if (!aHasPre && bHasPre) return 1;
  if (aHasPre && !bHasPre) return -1;
  if (!aHasPre && !bHasPre) return 0;

  const len = Math.max(pA.prerelease.length, pB.prerelease.length);
  for (let i = 0; i < len; i++) {
    const identA = pA.prerelease[i];
    const identB = pB.prerelease[i];

    if (identA === undefined) return -1;
    if (identB === undefined) return 1;
    if (identA === identB) continue;

    const isNumA = /^\d+$/.test(identA);
    const isNumB = /^\d+$/.test(identB);

    if (isNumA && isNumB) {
      const numA = parseInt(identA, 10);
      const numB = parseInt(identB, 10);
      if (numA !== numB) return numA > numB ? 1 : -1;
    } else if (isNumA && !isNumB) {
      return -1;
    } else if (!isNumA && isNumB) {
      return 1;
    } else {
      const cmp = identA.localeCompare(identB);
      if (cmp !== 0) return cmp > 0 ? 1 : -1;
    }
  }

  return 0;
}

export function rcompare(a: string, b: string): number {
  return compare(b, a);
}

export function gt(a: string, b: string): boolean {
  return compare(a, b) > 0;
}

export function gte(a: string, b: string): boolean {
  return compare(a, b) >= 0;
}

export function lt(a: string, b: string): boolean {
  return compare(a, b) < 0;
}

export function lte(a: string, b: string): boolean {
  return compare(a, b) <= 0;
}

export function eq(a: string, b: string): boolean {
  return compare(a, b) === 0;
}

export const semver = {
  clean,
  coerce,
  valid,
  compare,
  rcompare,
  gt,
  gte,
  lt,
  lte,
  eq,
};

export default semver;
