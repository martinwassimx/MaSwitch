import path from 'node:path';

const DEFAULT_APPROVAL_TTL_MS = 30 * 60 * 1000;

export function normalizeWindowsPath(rawPath: string): string {
  return path.win32.normalize(rawPath.trim()).toLowerCase();
}

/**
 * Paths the user chose in a main-process dialog. Lets IPC handlers accept a renderer-supplied
 * path only when it originated from a native picker (or another main-process confirmation).
 */
export class PathApprovalRegistry {
  private readonly approved = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = DEFAULT_APPROVAL_TTL_MS
  ) {}

  public approve(rawPath: string): void {
    this.approved.set(normalizeWindowsPath(rawPath), this.now() + this.ttlMs);
  }

  public isApproved(rawPath: string): boolean {
    const key = normalizeWindowsPath(rawPath);
    const expiry = this.approved.get(key);
    if (expiry === undefined) {
      return false;
    }
    if (expiry < this.now()) {
      this.approved.delete(key);
      return false;
    }
    return true;
  }
}

/** True when `candidate` resolves to a direct or nested child of `root` (no traversal). */
export function isPathInside(root: string, candidate: string): boolean {
  const rel = path.win32.relative(path.win32.resolve(root), path.win32.resolve(candidate));
  return rel.length > 0 && !rel.startsWith('..') && !path.win32.isAbsolute(rel);
}
