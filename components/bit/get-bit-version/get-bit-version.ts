import { join } from 'path';
import { existsSync } from 'fs-extra';

export function getBitVersion(): string {
    const teambitBit = require.resolve('@teambit/bit');
    // For bundle cases, the teambitBit point to a flat folder that contains the package.json
    let packageJsonPath = join(teambitBit, '../', 'package.json');
    if (!existsSync(packageJsonPath)) {
      // for dev cases, the teambitBit point to the dist folder that doesn't contains the package.json
      packageJsonPath = join(teambitBit, '../..', 'package.json');
    }
    if (!existsSync(packageJsonPath)) {
      throw new Error('unable to find Bit version (package.json not found)');
    }
    // eslint-disable-next-line
    const packageJson = require(packageJsonPath);
    if (packageJson.version) return packageJson.version;
    // this is running locally
    if (packageJson.componentId && packageJson.componentId.version) {
      return packageJson.componentId.version || `last-tag ${packageJson.componentId.version}`;
    }
    throw new Error('unable to find Bit version (version not found in package.json)');
}

export function getBitVersionGracefully(): string | null {
  try {
    return getBitVersion();
  } catch {
    return null;
  }
}
