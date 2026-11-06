import { describe, it, expect } from 'vitest';
import semver, {
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
} from '../electron/services/updater/semverUtils';

describe('Zero-Dependency SemVer Utility (semverUtils)', () => {
  describe('clean and valid', () => {
    it('cleans tags with leading v or V', () => {
      expect(clean('v1.0.4')).toBe('1.0.4');
      expect(clean('V1.2.3')).toBe('1.2.3');
      expect(clean('  v1.0.4  ')).toBe('1.0.4');
      expect(clean('1.0.4')).toBe('1.0.4');
    });

    it('cleans pre-release tags', () => {
      expect(clean('v1.0.5-beta.1')).toBe('1.0.5-beta.1');
      expect(clean('1.0.5-alpha.2+build123')).toBe('1.0.5-alpha.2');
    });

    it('returns null for invalid semver strings', () => {
      expect(clean('not-a-version')).toBeNull();
      expect(clean('')).toBeNull();
      expect(clean('1.0')).toBeNull();
      expect(valid('invalid')).toBeNull();
    });

    it('validates correct semver strings', () => {
      expect(valid('1.0.4')).toBe('1.0.4');
      expect(valid('v1.0.4')).toBe('1.0.4');
      expect(valid('1.0.5-beta.1')).toBe('1.0.5-beta.1');
    });
  });

  describe('coerce', () => {
    it('coerces incomplete versions into major.minor.patch', () => {
      expect(coerce('1')?.version).toBe('1.0.0');
      expect(coerce('1.2')?.version).toBe('1.2.0');
      expect(coerce('v1.2.3')?.version).toBe('1.2.3');
      expect(coerce('release-2.3.4-final')?.version).toBe('2.3.4');
    });

    it('returns null when no numbers are found', () => {
      expect(coerce('no-numbers')).toBeNull();
    });
  });

  describe('compare and rcompare', () => {
    it('correctly compares major versions', () => {
      expect(compare('2.0.0', '1.9.9')).toBe(1);
      expect(compare('1.0.0', '2.0.0')).toBe(-1);
      expect(compare('1.0.0', '1.0.0')).toBe(0);
    });

    it('correctly compares minor versions', () => {
      expect(compare('1.2.0', '1.1.9')).toBe(1);
      expect(compare('1.1.0', '1.2.0')).toBe(-1);
    });

    it('correctly compares patch versions', () => {
      expect(compare('1.0.5', '1.0.4')).toBe(1);
      expect(compare('1.0.4', '1.0.5')).toBe(-1);
    });

    it('normal release has higher precedence than prerelease of same version', () => {
      expect(compare('1.0.5', '1.0.5-beta.1')).toBe(1);
      expect(compare('1.0.5-beta.1', '1.0.5')).toBe(-1);
    });

    it('correctly compares prerelease numbers and identifiers', () => {
      expect(compare('1.0.5-beta.2', '1.0.5-beta.1')).toBe(1);
      expect(compare('1.0.5-beta.1', '1.0.5-beta.2')).toBe(-1);
      expect(compare('1.0.5-beta.1', '1.0.5-alpha.9')).toBe(1);
      expect(compare('1.0.5-beta.1', '1.0.5-beta.1')).toBe(0);
      expect(compare('1.0.5-beta', '1.0.5-beta.1')).toBe(-1); // shorter prerelease is lower
    });

    it('prerelease of newer version is greater than older stable version', () => {
      expect(compare('1.0.5-beta.1', '1.0.4')).toBe(1);
      expect(compare('1.0.4', '1.0.5-beta.1')).toBe(-1);
    });

    it('rcompare reverses comparison for sorting', () => {
      expect(rcompare('1.0.5', '1.0.4')).toBe(-1);
      expect(rcompare('1.0.4', '1.0.5')).toBe(1);
    });
  });

  describe('comparison boolean helpers (gt, gte, lt, lte, eq)', () => {
    it('evaluates gt and gte correctly', () => {
      expect(gt('1.0.5', '1.0.4')).toBe(true);
      expect(gt('1.0.4', '1.0.5')).toBe(false);
      expect(gt('1.0.4', '1.0.4')).toBe(false);
      expect(gte('1.0.4', '1.0.4')).toBe(true);
      expect(gte('1.0.5', '1.0.4')).toBe(true);
    });

    it('evaluates lt and lte correctly', () => {
      expect(lt('1.0.4', '1.0.5')).toBe(true);
      expect(lt('1.0.5', '1.0.4')).toBe(false);
      expect(lte('1.0.4', '1.0.4')).toBe(true);
      expect(lte('1.0.3', '1.0.4')).toBe(true);
    });

    it('evaluates eq correctly', () => {
      expect(eq('v1.0.4', '1.0.4')).toBe(true);
      expect(eq('1.0.4', '1.0.5')).toBe(false);
    });

    it('matches default export interface', () => {
      expect(semver.clean('v1.0.4')).toBe('1.0.4');
      expect(semver.gt('1.0.5', '1.0.4')).toBe(true);
      expect(semver.rcompare('1.0.5', '1.0.4')).toBe(-1);
    });
  });
});
