import { MainRuntime } from '@teambit/cli';
import { ExtensionDataList } from '@teambit/legacy.extension-data';

import { BitAspect } from './bit.aspect';
import { provideBit } from './bit.provider';
import { getManifestsMap } from './manifests';

const manifestsMap = getManifestsMap();

export function registerCoreExtensions() {
  const allCoreExtensionsNames = Object.keys(manifestsMap);
  ExtensionDataList.registerManyCoreExtensionNames(allCoreExtensionsNames);
}

function getDeps() {
  return Object.values(manifestsMap);
}

export const BitMain = {
  name: 'bit',
  runtime: MainRuntime,
  dependencies: getDeps(),
  provider: provideBit,
};

BitAspect.addRuntime(BitMain);
