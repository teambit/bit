import { BitAspect } from './bit.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { manifestsMap } from './manifests';
import { provideBit } from './bit.provider';
import { ExtensionDataList } from '../../consumer/config/extension-data';

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
