import { getConfig } from '@pnpm/config.reader';
import path from 'path';

export async function readConfig(dir?: string) {
  const workspaceDir = dir ? path.resolve(dir) : undefined;
  const pnpmConfig = await getConfig({
    cliOptions: {
      dir,
      // 'global': true,
      // 'link-workspace-packages': true,
    },
    workspaceDir,
    packageManager: {
      name: 'pnpm',
      version: '1.0.0',
    },
  });
  return pnpmConfig;
}
