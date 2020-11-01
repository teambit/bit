import getConfig from '@pnpm/config';

export async function readConfig() {
  const pnpmConfig = await getConfig({
    cliOptions: {
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
