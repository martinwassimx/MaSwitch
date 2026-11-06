import type matchers from '@testing-library/jest-dom/matchers';
import 'vitest';

// jest-dom's bundled augmentation targets the pre-v5 `Assertion<T>` shape; Vitest 5 resolves custom matchers via `Matchers<R, T>`.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R, T> extends matchers.TestingLibraryMatchers<unknown, R> {}
}
