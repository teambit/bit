import type { ResolvedConfig } from '@pnpm/napi';
import path from 'path';

/**
 * Resolve the configuration the pnpm engine's own installs use — the
 * `.npmrc` / `pnpm-workspace.yaml` cascade — through `@pnpm/napi`, so Bit
 * needs no JavaScript config reader.
 */
export async function readConfig(dir?: string): Promise<{ config: ResolvedConfig; warnings: string[] }> {
  // Required lazily so the native engine binary is not mapped into every
  // `bit` process at startup — only commands that actually read the pnpm
  // config pay for it (same convention as the `./lynx` require sites).
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { readConfig: napiReadConfig } = require('@pnpm/napi') as {
    readConfig: (options: { dir: string }) => ResolvedConfig;
  };
  const config = napiReadConfig({ dir: path.resolve(dir ?? process.cwd()) });
  return { config, warnings: [] };
}
