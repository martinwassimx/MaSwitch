/**
 * Riot account identity and region rules.
 *
 * League platform codes and VALORANT shards are not the same thing as Riot's
 * routing groups (europe, americas, asia). A Riot ID tagline is not a server.
 */

export const LOL_REGIONS = [
  { code: 'EUW', platform: 'EUW1' },
  { code: 'EUNE', platform: 'EUN1' },
  { code: 'NA', platform: 'NA1' },
  { code: 'BR', platform: 'BR1' },
  { code: 'LAN', platform: 'LA1' },
  { code: 'LAS', platform: 'LA2' },
  { code: 'KR', platform: 'KR' },
  { code: 'JP', platform: 'JP1' },
  { code: 'OCE', platform: 'OC1' },
  { code: 'TR', platform: 'TR1' },
  { code: 'RU', platform: 'RU' },
  { code: 'PH', platform: 'PH2' },
  { code: 'SG', platform: 'SG2' },
  { code: 'TH', platform: 'TH2' },
  { code: 'TW', platform: 'TW2' },
  { code: 'VN', platform: 'VN2' },
] as const;

export type LolRegionCode = (typeof LOL_REGIONS)[number]['code'];

export const VALORANT_REGIONS = [
  { code: 'EMEA', shard: 'eu' },
  { code: 'NA', shard: 'na' },
  { code: 'LATAM', shard: 'latam' },
  { code: 'BR', shard: 'br' },
  { code: 'AP', shard: 'ap' },
  { code: 'KR', shard: 'kr' },
] as const;

export type ValorantRegionCode = (typeof VALORANT_REGIONS)[number]['code'];

export type RegionSource = 'riot-client' | 'user' | 'default';

export const VALORANT_DEFAULT_REGION: ValorantRegionCode = 'EMEA';

const LOL_BY_TOKEN = new Map<string, LolRegionCode>();
for (const region of LOL_REGIONS) {
  LOL_BY_TOKEN.set(region.code.toLowerCase(), region.code);
  LOL_BY_TOKEN.set(region.platform.toLowerCase(), region.code);
}

const VALORANT_BY_TOKEN = new Map<string, ValorantRegionCode>();
for (const region of VALORANT_REGIONS) {
  VALORANT_BY_TOKEN.set(region.code.toLowerCase(), region.code);
  VALORANT_BY_TOKEN.set(region.shard.toLowerCase(), region.code);
}

/** Routing groups and other values that must never be shown as a League server. */
const LOL_ROUTING_GROUPS = new Set(['europe', 'americas', 'asia', 'sea', 'eu', 'na', 'ap', 'latam']);

export function normalizeLolRegion(raw: string | null | undefined): LolRegionCode | null {
  if (!raw) return null;
  const token = raw.trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (!token || LOL_ROUTING_GROUPS.has(token)) return null;
  return LOL_BY_TOKEN.get(token) ?? null;
}

export function normalizeValorantRegion(raw: string | null | undefined): ValorantRegionCode | null {
  if (!raw) return null;
  const token = raw.trim().replace(/^["']|["']$/g, '').toLowerCase();
  return VALORANT_BY_TOKEN.get(token) ?? null;
}

/**
 * Builds a Riot ID only from a game name and tagline that were read as separate fields.
 * A login username is not accepted, even when it contains a '#'.
 */
export function formatRiotId(gameName: string | null | undefined, tagline: string | null | undefined): string | null {
  const name = gameName?.trim() ?? '';
  const tag = tagline?.trim().replace(/^#/, '') ?? '';
  if (!name || !tag || name.includes('#') || /[\r\n\0]/.test(name) || /[\r\n\0]/.test(tag)) return null;
  if (name.length > 16 || tag.length < 2 || tag.length > 5) return null;
  if (!/^[A-Za-z0-9]+$/.test(tag)) return null;
  return `${name}#${tag}`;
}

export interface ParsedRiotClientSettings {
  globalsRegion: string | null;
  valorantLive: string | null;
}

/** Reads only the region fields MaSwitch understands. Other values are ignored. */
export function parseRiotClientSettingsYaml(text: string): ParsedRiotClientSettings {
  const stack: Array<{ indent: number; key: string }> = [];
  let globalsRegion: string | null = null;
  let valorantLive: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^(\s*)([A-Za-z0-9_.-]{1,64}):\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2];
    const rawValue = match[3].trim();
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) stack.pop();
    const path = [...stack.map((entry) => entry.key), key];
    const value = rawValue.replace(/^["']|["']$/g, '');
    const safe = /^[A-Za-z0-9_-]{2,12}$/.test(value) ? value : null;
    if (safe && path.join('.') === 'install.globals.region') globalsRegion = safe;
    if (safe && path.join('.') === 'install.player-affinity.product.valorant.live') valorantLive = safe;
    if (!rawValue) stack.push({ indent, key });
  }

  return { globalsRegion, valorantLive };
}

export interface StoredRiotRegions {
  lolRegion: string | null;
  lolRegionSource: RegionSource | null;
  valorantRegion: string | null;
  valorantRegionSource: RegionSource | null;
}

export interface DetectedRiotRegions {
  lolRegion: LolRegionCode | null;
  valorantRegion: ValorantRegionCode | null;
}

/**
 * Applies a client reading without replacing a region the user chose.
 * A missing VALORANT shard becomes the EMEA default, which a later verified
 * reading is allowed to replace. A user choice is not.
 */
export function mergeDetectedRegions(stored: StoredRiotRegions, detected: DetectedRiotRegions): StoredRiotRegions {
  const next: StoredRiotRegions = { ...stored };
  if (stored.lolRegionSource !== 'user' && detected.lolRegion) {
    next.lolRegion = detected.lolRegion;
    next.lolRegionSource = 'riot-client';
  }
  if (stored.valorantRegionSource !== 'user') {
    if (detected.valorantRegion) {
      next.valorantRegion = detected.valorantRegion;
      next.valorantRegionSource = 'riot-client';
    } else if (!stored.valorantRegion || stored.valorantRegionSource === 'default' || stored.valorantRegionSource === null) {
      next.valorantRegion = VALORANT_DEFAULT_REGION;
      next.valorantRegionSource = 'default';
    }
  }
  return next;
}

export function lolRegionLine(region: string | null, source: RegionSource | null): string {
  if (!region || source === null) return 'League of Legends — Region not detected';
  const suffix = source === 'user' ? ' (set by you)' : '';
  return `League of Legends — ${region}${suffix}`;
}

export function valorantRegionLine(region: string | null, source: RegionSource | null): string {
  const shown = region || VALORANT_DEFAULT_REGION;
  if (source === 'user') return `VALORANT — ${shown} (set by you)`;
  if (source === 'riot-client') return `VALORANT — ${shown}`;
  return `VALORANT — ${VALORANT_DEFAULT_REGION} (default)`;
}

export function accountPrimaryLabel(profile: {
  riotId?: string | null;
  riotIdSource?: string | null;
  nickname?: string | null;
  displayName: string;
}): string {
  if (profile.riotId && profile.riotIdSource === 'riot-client') return profile.riotId;
  const nickname = profile.nickname?.trim();
  if (nickname) return nickname;
  return profile.displayName;
}
