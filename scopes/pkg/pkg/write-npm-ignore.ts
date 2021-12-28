import { join } from 'path';
import fs from 'fs-extra';
import { EnvsMain, PackageEnv } from '@teambit/envs';
import { Capsule } from '@teambit/isolator';

export async function writeNpmIgnore(capsule: Capsule, envs: EnvsMain): Promise<void> {
  const env = envs.getEnv(capsule.component).env as PackageEnv;
  const npmIgnoreEntries = env.getNpmIgnore?.();
  if (!npmIgnoreEntries || !npmIgnoreEntries.length) {
    return;
  }
  const NPM_IGNORE_FILE = '.npmignore';
  const npmIgnorePath = join(capsule.path, NPM_IGNORE_FILE);
  const npmIgnoreEntriesStr = `\n${npmIgnoreEntries.join('\n')}`;
  await fs.appendFile(npmIgnorePath, npmIgnoreEntriesStr);
}
