import { join } from 'path';
import fs from 'fs-extra';
import type { EnvsMain, PackageEnv } from '@teambit/envs';
import type { Capsule } from '@teambit/isolator';
import { CAPSULE_READY_FILE } from '@teambit/isolator';
import { DEFAULT_TAR_DIR_IN_CAPSULE } from './packer';

const DEFAULT_NPM_IGNORE_ENTRIES = [`${DEFAULT_TAR_DIR_IN_CAPSULE}/`, CAPSULE_READY_FILE];

export async function writeNpmIgnore(capsule: Capsule, envs: EnvsMain): Promise<void> {
  const env = envs.getEnv(capsule.component).env as PackageEnv;
  const envIgnoreEntries = env.getNpmIgnore?.({ component: capsule.component, capsule });
  const npmIgnoreEntries = DEFAULT_NPM_IGNORE_ENTRIES.concat(envIgnoreEntries || []);
  const NPM_IGNORE_FILE = '.npmignore';
  const npmIgnorePath = join(capsule.path, NPM_IGNORE_FILE);
  const npmIgnoreEntriesStr = `\n${npmIgnoreEntries.join('\n')}`;
  await fs.appendFile(npmIgnorePath, npmIgnoreEntriesStr);
}
