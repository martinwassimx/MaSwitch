import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  accountPrimaryLabel,
  formatRiotId,
  lolRegionLine,
  mergeDetectedRegions,
  normalizeLolRegion,
  normalizeValorantRegion,
  parseRiotClientSettingsYaml,
  valorantRegionLine,
} from '../src/shared/riot/riotAccountIdentity';
import { readRiotClientRegions } from '../electron/services/accounts/riotClientRegionReader';

const LEAGUE_SETTINGS = `
install:
    globals:
        locale: "en_US"
        region: "EUNE"
    player-affinity:
        product:
            bacon:
                live: europe
            lion:
                live: eu
            valorant:
                live: eu
`;

const CLIENT_SETTINGS = `
install:
    globals:
        region: EUW
    player-affinity:
        product:
            valorant:
                live: na
`;

describe('Riot identity and regions', () => {
  it('formats a Riot ID only from a separate game name and tagline', () => {
    expect(formatRiotId('Melynelas', 'EUW')).toBe('Melynelas#EUW');
    expect(formatRiotId('Melynelas', '#EUW')).toBe('Melynelas#EUW');
    expect(formatRiotId('loginname', null)).toBeNull();
    expect(formatRiotId('Melynelas#EUW', 'EUW')).toBeNull();
    expect(formatRiotId('', 'EUW')).toBeNull();
  });

  it('does not treat a routing group or a tagline as a League server', () => {
    expect(normalizeLolRegion('EUNE')).toBe('EUNE');
    expect(normalizeLolRegion('EUW1')).toBe('EUW');
    expect(normalizeLolRegion('LA1')).toBe('LAN');
    expect(normalizeLolRegion('europe')).toBeNull();
    expect(normalizeLolRegion('eu')).toBeNull();
    expect(normalizeLolRegion('americas')).toBeNull();
    expect(normalizeLolRegion('EUW')).not.toBe(normalizeLolRegion('Melynelas#EUW'));
  });

  it('maps VALORANT shards and ignores datacenter names', () => {
    expect(normalizeValorantRegion('eu')).toBe('EMEA');
    expect(normalizeValorantRegion('latam')).toBe('LATAM');
    expect(normalizeValorantRegion('kr')).toBe('KR');
    expect(normalizeValorantRegion('frankfurt')).toBeNull();
    expect(normalizeValorantRegion('paris')).toBeNull();
  });

  it('reads League platform and VALORANT shard fields from client settings', () => {
    const parsed = parseRiotClientSettingsYaml(LEAGUE_SETTINGS);
    expect(parsed.globalsRegion).toBe('EUNE');
    expect(parsed.valorantLive).toBe('eu');
    expect(normalizeLolRegion(parsed.globalsRegion)).toBe('EUNE');
    expect(normalizeValorantRegion(parsed.valorantLive)).toBe('EMEA');
  });

  it('keeps a user-selected region and replaces only the default', () => {
    const kept = mergeDetectedRegions(
      { lolRegion: 'KR', lolRegionSource: 'user', valorantRegion: 'NA', valorantRegionSource: 'user' },
      { lolRegion: 'EUW', valorantRegion: 'EMEA' }
    );
    expect(kept.lolRegion).toBe('KR');
    expect(kept.valorantRegion).toBe('NA');

    const updated = mergeDetectedRegions(
      { lolRegion: null, lolRegionSource: null, valorantRegion: 'EMEA', valorantRegionSource: 'default' },
      { lolRegion: 'EUW', valorantRegion: 'NA' }
    );
    expect(updated).toMatchObject({
      lolRegion: 'EUW',
      lolRegionSource: 'riot-client',
      valorantRegion: 'NA',
      valorantRegionSource: 'riot-client',
    });
  });

  it('uses the EMEA default only when VALORANT was not detected or chosen', () => {
    const merged = mergeDetectedRegions(
      { lolRegion: null, lolRegionSource: null, valorantRegion: null, valorantRegionSource: null },
      { lolRegion: null, valorantRegion: null }
    );
    expect(merged.valorantRegion).toBe('EMEA');
    expect(merged.valorantRegionSource).toBe('default');
    expect(valorantRegionLine(null, null)).toBe('VALORANT — EMEA (default)');
    expect(lolRegionLine(null, null)).toBe('League of Legends — Region not detected');
  });

  it('shows a verified Riot ID, then the nickname, and never the login username by itself', () => {
    expect(
      accountPrimaryLabel({ riotId: 'Melynelas#EUW', riotIdSource: 'riot-client', nickname: 'Main', displayName: 'Old' })
    ).toBe('Melynelas#EUW');
    expect(accountPrimaryLabel({ riotId: null, nickname: 'My Main Account', displayName: 'LOL EUW — Melynelas' })).toBe(
      'My Main Account'
    );
    expect(accountPrimaryLabel({ nickname: null, displayName: 'LOL EUW — Melynelas' })).toBe('LOL EUW — Melynelas');
  });

  it('reads product settings from disk and prefers the League file over the shared client region', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-region-'));
    const write = (relative: string, body: string) => {
      const full = path.join(root, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body, 'utf8');
    };
    write(path.join('Riot Games', 'League of Legends', 'Config', 'RiotClientSettings.yaml'), LEAGUE_SETTINGS);
    write(path.join('Riot Games', 'Riot Client', 'Config', 'RiotClientSettings.yaml'), CLIENT_SETTINGS);
    write(
      path.join('Riot Games', 'Riot Client', 'Data', 'RiotGamesPrivateSettings.yaml'),
      'riot-login:\n    persist:\n    username: secret-login\n'
    );

    const read = readRiotClientRegions(root);
    expect(read.lolRegion).toBe('EUNE');
    expect(read.valorantRegion).toBe('NA');
    expect(read.riotId).toBeNull();
    expect(read.riotIdAvailable).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
