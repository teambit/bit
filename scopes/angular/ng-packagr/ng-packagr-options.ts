import type { CompilerOptions } from '@teambit/compiler';

export type NgPackagrOptions = {
  /**
   * Overwrite tsconfig allowJs option
   */
  allowJs?: boolean;
} & Partial<CompilerOptions>;
