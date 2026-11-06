declare module 'semver' {
  export function clean(version: string): string | null;
  export function valid(version: string | null | undefined): string | null;
  export function coerce(version: string | null | undefined): { version: string } | null;
  export function gt(v1: string, v2: string): boolean;
  export function rcompare(v1: string, v2: string): number;
}
