import { MainRuntime } from '@teambit/cli';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';

import { BitAspect } from './bit.aspect';
import { provideBit } from './bit.provider';
import { manifestsMap } from './manifests';

const manifests = Object.values(manifestsMap);

export function registerCoreExtensions() {
  const allCoreExtensionsNames = Object.keys(manifestsMap);
  ExtensionDataList.registerManyCoreExtensionNames(allCoreExtensionsNames);
}

export const BitMain = {
  name: 'bit',
  runtime: MainRuntime,
  dependencies: manifests,
  provider: provideBit,
};

BitAspect.addRuntime(BitMain);
