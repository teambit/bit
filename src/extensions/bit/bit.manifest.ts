import { ExtensionManifest } from '@teambit/harmony';
import { manifestsMap } from './manifests';
import { provideBit } from './bit.provider';
import { ExtensionDataList } from '../../consumer/config/extension-data';

const manifests = Object.values(manifestsMap);

export function registerCoreExtensions() {
  const allCoreExtensionsNames = Object.keys(manifestsMap);
  ExtensionDataList.registerManyCoreExtensionNames(allCoreExtensionsNames);
}

export default {
  name: 'bit',
  dependencies: manifests,
  provider: provideBit
} as ExtensionManifest;
