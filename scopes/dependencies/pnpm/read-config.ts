import { getConfig } from '@pnpm/config';

export async function readConfig(dir?: string) {
  const pnpmConfig = await getConfig({
    cliOptions: {
      dir,
      // 'global': true,
      // 'link-workspace-packages': true,
    },
    packageManager: {
      name: 'pnpm',
      version: '1.0.0',
    },
  });
  return pnpmConfig;
}
