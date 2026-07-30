import { readConfig as napiReadConfig } from '@pnpm/napi';
import type { ResolvedConfig } from '@pnpm/napi';
import path from 'path';

/**
 * Resolve the configuration the pnpm engine's own installs use — the
 * `.npmrc` / `pnpm-workspace.yaml` cascade — through `@pnpm/napi`, so Bit
 * needs no JavaScript config reader.
 */
export async function readConfig(dir?: string): Promise<{ config: ResolvedConfig; warnings: string[] }> {
  const config = napiReadConfig({ dir: path.resolve(dir ?? process.cwd()) });
  return { config, warnings: [] };
}
