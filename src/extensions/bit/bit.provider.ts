import { manifestsMap } from './manifests';
import { ExtensionDataList } from '../../consumer/config/extension-data';

const allCoreExtensionsNames = Object.keys(manifestsMap);
ExtensionDataList.registerManyCoreExtensionNames(allCoreExtensionsNames);

export type BitDeps = [];

export type BitConfig = {};

export async function provideBit() {
  return {
    manifestsMap
  };
}
