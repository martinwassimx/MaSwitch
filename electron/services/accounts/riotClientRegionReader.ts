import fs from 'node:fs';
import path from 'node:path';
import { isSymlinkOrReparsePoint } from './riotProductionAdapters';
import {
  normalizeLolRegion,
  normalizeValorantRegion,
  parseRiotClientSettingsYaml,
  type DetectedRiotRegions,
  type LolRegionCode,
  type ValorantRegionCode,
} from '../../../src/shared/riot/riotAccountIdentity';

const MAX_SETTINGS_BYTES = 256 * 1024;

export interface RiotRegionReadResult extends DetectedRiotRegions {
  /** Riot ID is not present in the client settings files MaSwitch is allowed to read. */
  riotId: null;
  riotIdAvailable: false;
}

function readSettings(filePath: string): ReturnType<typeof parseRiotClientSettingsYaml> | null {
  try {
    if (!fs.existsSync(filePath) || isSymlinkOrReparsePoint(filePath)) return null;
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SETTINGS_BYTES) return null;
    return parseRiotClientSettingsYaml(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Reads League and VALORANT regions from Riot Client configuration on this PC.
 *
 * League uses the League of Legends product settings first, because the shared
 * Riot Client region can differ. VALORANT uses the product shard (`valorant.live`),
 * which is a region such as `eu`, not a matchmaking datacenter.
 *
 * These files describe the client's current configuration. They are not a
 * per-account Riot account-service lookup, and they do not contain a Riot ID.
 * The private settings file is intentionally not read: it holds session material.
 */
export function readRiotClientRegions(localAppData: string): RiotRegionReadResult {
  const riotGames = path.join(localAppData, 'Riot Games');
  const league = readSettings(path.join(riotGames, 'League of Legends', 'Config', 'RiotClientSettings.yaml'));
  const client = readSettings(path.join(riotGames, 'Riot Client', 'Config', 'RiotClientSettings.yaml'));
  const valorant = readSettings(path.join(riotGames, 'VALORANT', 'Config', 'RiotClientSettings.yaml'));

  const lolRegion: LolRegionCode | null =
    normalizeLolRegion(league?.globalsRegion) ?? normalizeLolRegion(client?.globalsRegion);
  const valorantRegion: ValorantRegionCode | null =
    normalizeValorantRegion(valorant?.valorantLive) ?? normalizeValorantRegion(client?.valorantLive);

  return { lolRegion, valorantRegion, riotId: null, riotIdAvailable: false };
}
