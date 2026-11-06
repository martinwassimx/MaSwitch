import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ArtworkCacheService } from '../electron/services/artwork/artworkCacheService';

const SOURCE_PATH = path.join(__dirname, '../electron/services/artwork/artworkCacheService.ts');

const MARKER_NAME = 'maswitch_icon_injection_marker.txt';

// Valid Windows folder names that broke out of the former PowerShell single-quoted literal
// (U+2018-U+201B) plus other shell metacharacters. Each creates MARKER_NAME if executed.
const HOSTILE_SEGMENTS = [
  `Game\u2019) ; New-Item -ItemType File -Path ${MARKER_NAME} ; $x=(\u2019`,
  `Game\u2018) ; New-Item -ItemType File -Path ${MARKER_NAME} ; $x=(\u2018`,
  `Game\u201A$(New-Item -ItemType File -Path ${MARKER_NAME})\u201B`,
  `Game'; New-Item -ItemType File -Path ${MARKER_NAME}; '`,
  `Game\`$(New-Item ${MARKER_NAME})\` & calc ; y`,
  'Spiel – Ünïcödé 日本語 (x86) [v1.0] {a}',
];

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(400, 1),
]);

describe('Executable icon extraction does not build commands from paths (MS-06)', () => {
  let root: string;
  const markerCreated = () =>
    [root, process.cwd(), os.tmpdir()].some((d) => fs.existsSync(path.join(d, MARKER_NAME)));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-icon-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('contains no child-process or PowerShell invocation', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');
    expect(source).not.toMatch(/child_process|execFile|spawn\(|powershell/i);
  });

  it.runIf(process.platform === 'win32').each(HOSTILE_SEGMENTS.map((s, i) => [i, s]))(
    'passes hostile path #%i verbatim to the extractor and executes nothing',
    async (index, segment) => {
      const folder = path.join(root, segment as string);
      fs.mkdirSync(folder, { recursive: true });
      const exePath = path.join(folder, 'game.exe');
      fs.writeFileSync(exePath, Buffer.from('MZ synthetic'));

      const extractor = vi.fn(async () => PNG_BYTES);
      const service = new ArtworkCacheService(path.join(root, 'userData'), { iconExtractor: extractor });

      const uri = await service.extractExeIcon(exePath, `custom-game-${index}`);

      expect(extractor).toHaveBeenCalledTimes(1);
      expect(extractor).toHaveBeenCalledWith(exePath);
      expect(uri).toBe(`maswitch-asset://icon/custom-game-${index}.png`);
      expect(fs.readFileSync(path.join(service.getIconDir(), `custom-game-${index}.png`))).toEqual(PNG_BYTES);
      expect(markerCreated()).toBe(false);
    }
  );

  it.runIf(process.platform === 'win32')('sanitizes the cache filename derived from the game key', async () => {
    const exePath = path.join(root, 'game.exe');
    fs.writeFileSync(exePath, Buffer.from('MZ synthetic'));
    const service = new ArtworkCacheService(path.join(root, 'userData'), {
      iconExtractor: async () => PNG_BYTES,
    });

    const uri = await service.extractExeIcon(exePath, '..\\..\\evil\u2019key');

    expect(uri).toBe('maswitch-asset://icon/______evil_key.png');
    expect(fs.readdirSync(service.getIconDir())).toEqual(['______evil_key.png']);
  });

  it.runIf(process.platform === 'win32')('returns null when the executable has no usable icon or extraction fails', async () => {
    const exePath = path.join(root, 'noicon.exe');
    fs.writeFileSync(exePath, Buffer.from('MZ synthetic'));

    const none = new ArtworkCacheService(path.join(root, 'a'), { iconExtractor: async () => null });
    const throws = new ArtworkCacheService(path.join(root, 'b'), {
      iconExtractor: async () => {
        throw new Error('no icon');
      },
    });
    const unset = new ArtworkCacheService(path.join(root, 'c'));

    expect(await none.extractExeIcon(exePath, 'g1')).toBeNull();
    expect(await throws.extractExeIcon(exePath, 'g2')).toBeNull();
    expect(await unset.extractExeIcon(exePath, 'g3')).toBeNull();
  });

  it('reuses an existing cached icon without calling the extractor again', async () => {
    const exePath = path.join(root, 'cached.exe');
    fs.writeFileSync(exePath, Buffer.from('MZ synthetic'));
    const extractor = vi.fn(async () => PNG_BYTES);
    const service = new ArtworkCacheService(path.join(root, 'userData'), { iconExtractor: extractor });
    fs.writeFileSync(path.join(service.getIconDir(), 'cached-game.png'), PNG_BYTES);

    if (process.platform === 'win32') {
      expect(await service.extractExeIcon(exePath, 'cached-game')).toBe('maswitch-asset://icon/cached-game.png');
      expect(extractor).not.toHaveBeenCalled();
    }
  });
});
