export interface VdfObject {
  [key: string]: string | VdfObject;
}

/**
 * Parses Valve Data Format (.vdf / .acf) text into a nested dictionary.
 * Handles escaped quotes, escaped backslashes, comments, and malformed/truncated blocks safely.
 */
export function parseVdf(content: string): VdfObject {
  if (!content || typeof content !== 'string') {
    return {};
  }

  const tokens: string[] = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    // Skip single-line comments
    if (ch === '/' && content[i + 1] === '/') {
      i += 2;
      while (i < len && content[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Structural braces
    if (ch === '{' || ch === '}') {
      tokens.push(ch);
      i++;
      continue;
    }

    // Quoted string token
    if (ch === '"') {
      i++;
      let str = '';
      while (i < len) {
        const c = content[i];
        if (c === '\\' && i + 1 < len) {
          const next = content[i + 1];
          if (next === '"' || next === '\\') {
            str += next;
          } else if (next === 'n') {
            str += '\n';
          } else if (next === 't') {
            str += '\t';
          } else {
            str += '\\' + next;
          }
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        str += c;
        i++;
      }
      tokens.push(str);
      continue;
    }

    // Unquoted token fallback
    let unquoted = '';
    while (
      i < len &&
      content[i] !== ' ' &&
      content[i] !== '\t' &&
      content[i] !== '\r' &&
      content[i] !== '\n' &&
      content[i] !== '{' &&
      content[i] !== '}' &&
      content[i] !== '"'
    ) {
      unquoted += content[i];
      i++;
    }
    if (unquoted.length > 0) {
      tokens.push(unquoted);
    }
  }

  let cursor = 0;

  function parseBlock(): VdfObject {
    const obj: VdfObject = {};

    while (cursor < tokens.length) {
      const token = tokens[cursor];

      if (token === '}') {
        cursor++;
        return obj;
      }

      if (token === '{') {
        // Unexpected opening brace without key; consume block safely
        cursor++;
        parseBlock();
        continue;
      }

      const key = token;
      cursor++;

      if (cursor >= tokens.length) {
        break;
      }

      const nextToken = tokens[cursor];
      if (nextToken === '{') {
        cursor++;
        const child = parseBlock();
        const existing = obj[key];
        if (existing && typeof existing === 'object') {
          obj[key] = { ...existing, ...child };
        } else {
          obj[key] = child;
        }
      } else if (nextToken === '}') {
        // Malformed key before closing brace
        cursor++;
        return obj;
      } else {
        obj[key] = nextToken;
        cursor++;
      }
    }

    return obj;
  }

  return parseBlock();
}

export function getCaseInsensitiveValue(
  obj: VdfObject | undefined,
  targetKey: string
): string | VdfObject | undefined {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  const lower = targetKey.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
}

export function getCaseInsensitiveString(
  obj: VdfObject | undefined,
  targetKey: string
): string | undefined {
  const val = getCaseInsensitiveValue(obj, targetKey);
  return typeof val === 'string' ? val : undefined;
}

/**
 * Extracts all Steam library folder paths from a parsed libraryfolders.vdf file.
 */
export function extractSteamLibraryFoldersFromVdf(vdfContent: string): string[] {
  const parsed = parseVdf(vdfContent);
  const root =
    (getCaseInsensitiveValue(parsed, 'libraryfolders') as VdfObject | undefined) ??
    (getCaseInsensitiveValue(parsed, 'LibraryFolders') as VdfObject | undefined);

  if (!root || typeof root !== 'object') {
    return [];
  }

  const paths: string[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (!/^\d+$/.test(key)) {
      continue;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      paths.push(value.replace(/\\\\/g, '\\').trim());
    } else if (value && typeof value === 'object') {
      const folderPath = getCaseInsensitiveString(value, 'path');
      if (folderPath && folderPath.trim().length > 0) {
        paths.push(folderPath.replace(/\\\\/g, '\\').trim());
      }
    }
  }

  return Array.from(new Set(paths));
}

export interface ParsedSteamAcfManifest {
  appId: string;
  name: string;
  installDir: string;
  stateFlags: number;
  sizeOnDiskBytes: number;
  buildId: string;
  lastUpdated: number;
  isFullyInstalled: boolean;
}

/**
 * Extracts game metadata from a Steam appmanifest_*.acf file.
 * Returns null if required fields (appid, name, installdir) are missing or malformed.
 */
export function parseSteamAcfManifest(
  acfContent: string
): ParsedSteamAcfManifest | null {
  const parsed = parseVdf(acfContent);
  const appState = getCaseInsensitiveValue(parsed, 'AppState') as
    | VdfObject
    | undefined;

  if (!appState || typeof appState !== 'object') {
    return null;
  }

  const appId = getCaseInsensitiveString(appState, 'appid')?.trim();
  const name = getCaseInsensitiveString(appState, 'name')?.trim();
  const installDir = getCaseInsensitiveString(appState, 'installdir')?.trim();

  if (!appId || !/^\d+$/.test(appId) || !name || !installDir) {
    return null;
  }

  const stateFlagsRaw = getCaseInsensitiveString(appState, 'StateFlags') ?? '4';
  const stateFlags = Number.parseInt(stateFlagsRaw, 10) || 0;
  const sizeOnDiskRaw = getCaseInsensitiveString(appState, 'SizeOnDisk') ?? '0';
  const sizeOnDiskBytes = Number.parseInt(sizeOnDiskRaw, 10) || 0;
  const buildId = getCaseInsensitiveString(appState, 'buildid') ?? 'unknown';
  const lastUpdatedRaw =
    getCaseInsensitiveString(appState, 'LastUpdated') ?? '0';
  const lastUpdated = Number.parseInt(lastUpdatedRaw, 10) || 0;

  // In Steam ACF manifests, bit 2 (value 4) in StateFlags indicates Fully Installed
  const isFullyInstalled = (stateFlags & 4) === 4 || stateFlags === 0;

  return {
    appId,
    name,
    installDir,
    stateFlags,
    sizeOnDiskBytes,
    buildId,
    lastUpdated,
    isFullyInstalled,
  };
}

