import { join } from 'path';

export function getBitVersion(): string {
  const teambitBit = require.resolve('@teambit/bit');
  // eslint-disable-next-line
  const packageJson = require(join(teambitBit, '../..', 'package.json'));
  if (packageJson.version) return packageJson.version;
  throw new Error(`unable to find Bit version`);
}

export function getBitVersionGracefully(): string | null {
  try {
    return getBitVersion();
  } catch (err: any) {
    return null;
  }
}
