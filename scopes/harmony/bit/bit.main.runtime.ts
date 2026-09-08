import { MainRuntime } from '@teambit/cli';
import { getLegacyCoreEnvsIds } from '@teambit/envs';
import { ExtensionDataList } from '@teambit/legacy.extension-data';

import { BitAspect } from './bit.aspect';
import { provideBit } from './bit.provider';
import { manifestsMap } from './manifests';

const manifests = Object.values(manifestsMap);

export function registerCoreExtensions() {
  const allCoreExtensionsNames = Object.keys(manifestsMap);
  // legacy core envs (removed from the core) are registered as well, so their config entries are
  // persisted by name, without a version, the same way they were persisted when they were core.
  // otherwise, they become versioned dependencies of their components, which creates circular
  // dependencies (an env such as react depends on components that use it as their env).
  ExtensionDataList.registerManyCoreExtensionNames([...allCoreExtensionsNames, ...getLegacyCoreEnvsIds()]);
}

export const BitMain = {
  name: 'bit',
  runtime: MainRuntime,
  dependencies: manifests,
  provider: provideBit,
};

BitAspect.addRuntime(BitMain);
