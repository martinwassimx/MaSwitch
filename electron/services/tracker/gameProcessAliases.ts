import type { PlatformId } from '../../../src/shared/types/platform';

/**
 * Standard gaming launcher background/client executables that must NEVER be
 * tracked as active gameplay.
 */
export const LAUNCHER_CLIENT_EXECUTABLES = new Set([
  'steam.exe',
  'steamwebhelper.exe',
  'steamservice.exe',
  'gameoverlayui.exe',
  'epicgameslauncher.exe',
  'epicwebhelper.exe',
  'riotclientservices.exe',
  'riotclientux.exe',
  'riotclientcrashhandler.exe',
  'eadesktop.exe',
  'eabackgroundservice.exe',
  'ealauncher.exe',
  'ealaunchhelper.exe',
  'origin.exe',
  'originwebhelperservice.exe',
  'originclient.exe',
  'upc.exe',
  'ubisoftgamelauncher.exe',
  'ubisoftgamelauncher64.exe',
  'uplay.exe',
  'galaxyclient.exe',
  'galaxyclienthelper.exe',
  'rockstarservice.exe',
  'rockstargameslauncher.exe',
  'socialclubhelper.exe',
]);

/**
 * Curated dictionary of known gameplay process image names for PC titles.
 * Many games spawn a bootstrapper / splash screen first, and then hand off
 * to a distinct Shipping / Win64 game binary.
 */
const KNOWN_GAME_ALIASES_BY_KEYWORD: Record<string, string[]> = {
  // Riot Games
  valorant: ['valorant.exe', 'valorant-win64-shipping.exe'],
  'league of legends': [
    'leagueclient.exe',
    'league of legends.exe',
    'leagueclientux.exe',
  ],
  league_of_legends: [
    'leagueclient.exe',
    'league of legends.exe',
    'leagueclientux.exe',
  ],
  teamfighttactics: [
    'tftclient-win64-shipping.exe',
    'league of legends.exe',
    'leagueclient.exe',
  ],
  'teamfight tactics': [
    'tftclient-win64-shipping.exe',
    'league of legends.exe',
    'leagueclient.exe',
  ],

  // Epic Games
  fortnite: [
    'fortnitebootstrapper.exe',
    'fortniteclient-win64-shipping.exe',
    'fortniteclient-win64-shipping_eac.exe',
    'fortniteclient-win64-shipping_be.exe',
    'fortnitelauncher.exe',
  ],

  // EA Games
  'ea sports fc 27': ['fc27.exe', 'fc27_trial.exe'],
  fc27: ['fc27.exe', 'fc27_trial.exe'],
  'ea sports fc 24': ['fc24.exe', 'fc24_trial.exe'],
  'f1 25': ['f1_25.exe', 'f1_25_trial.exe'],
  f1_25: ['f1_25.exe', 'f1_25_trial.exe'],
  'f1 24': ['f1_24.exe', 'f1_24_trial.exe'],
  'it takes two': ['ittakestwo.exe', 'ittakestwo_steam.exe', 'ittakestwo_nuts.exe'],
  ittakestwo: ['ittakestwo.exe', 'ittakestwo_steam.exe', 'ittakestwo_nuts.exe'],
  apex: ['r5apex.exe'],
  'apex legends': ['r5apex.exe'],

  // Steam Games
  'wallpaper engine': ['wallpaperui.exe', 'wallpaper32.exe', 'wallpaper64.exe'],
  wallpaperui: ['wallpaperui.exe', 'wallpaper32.exe', 'wallpaper64.exe'],
  counterstrike: ['cs2.exe', 'csgo.exe'],
  'counter-strike': ['cs2.exe', 'csgo.exe'],
  cyberpunk: ['cyberpunk2077.exe'],
  'cyberpunk 2077': ['cyberpunk2077.exe'],
  dota: ['dota2.exe'],
  'dota 2': ['dota2.exe'],
  destiny: ['destiny2.exe'],
  'destiny 2': ['destiny2.exe'],

  // Custom / Racing / Adventure
  'forza horizon 5': ['forzahorizon5.exe'],
  forzahorizon5: ['forzahorizon5.exe'],
  'forza horizon 4': ['forzahorizon4.exe'],
  'marvels spider-man': ['milesmorales.exe', 'spiderman.exe'],
  'marvels spiderman miles morales': ['milesmorales.exe'],
  milesmorales: ['milesmorales.exe'],
  repo: ['repo.exe'],
  schedule: ['schedule i.exe', 'schedule.exe'],
  'schedule i': ['schedule i.exe'],
  gta: ['gta5.exe', 'playgtav.exe'],
  'grand theft auto': ['gta5.exe', 'playgtav.exe'],
  'red dead': ['rdr2.exe', 'playrdr2.exe'],
  rdr2: ['rdr2.exe', 'playrdr2.exe'],
};

/**
 * Returns a list of lowercased executable process image names that should be
 * matched for a given game item or installation record.
 */
export function resolveGameProcessAliases(
  title: string,
  platformId: PlatformId,
  primaryExeName?: string | null
): string[] {
  const result = new Set<string>();

  if (primaryExeName && primaryExeName.trim().length > 0) {
    const cleanPrimary = primaryExeName.trim().toLowerCase();
    result.add(cleanPrimary);

    // If primary has extension .exe, also try stripping _eac, _be, or bootstrapper suffixes
    const baseName = cleanPrimary.replace(/\.exe$/i, '');
    if (KNOWN_GAME_ALIASES_BY_KEYWORD[baseName]) {
      for (const a of KNOWN_GAME_ALIASES_BY_KEYWORD[baseName]) {
        result.add(a.toLowerCase());
      }
    }
  }

  const normalizedTitle = title.trim().toLowerCase();
  for (const [keyword, aliases] of Object.entries(KNOWN_GAME_ALIASES_BY_KEYWORD)) {
    if (normalizedTitle.includes(keyword) || keyword.includes(normalizedTitle)) {
      for (const a of aliases) {
        result.add(a.toLowerCase());
      }
    }
  }

  // Common platform conventions
  if (platformId === 'riot') {
    if (normalizedTitle.includes('valorant')) {
      result.add('valorant.exe');
      result.add('valorant-win64-shipping.exe');
    }
    if (normalizedTitle.includes('league') || normalizedTitle.includes('lol')) {
      result.add('leagueclient.exe');
      result.add('league of legends.exe');
    }
    if (normalizedTitle.includes('tft') || normalizedTitle.includes('teamfight')) {
      result.add('tftclient-win64-shipping.exe');
      result.add('league of legends.exe');
    }
  }

  if (platformId === 'epic') {
    if (normalizedTitle.includes('fortnite')) {
      result.add('fortnitebootstrapper.exe');
      result.add('fortniteclient-win64-shipping.exe');
    }
  }

  return Array.from(result);
}

