import { ExtensionManifest } from '@teambit/harmony';
import { manifestsMap } from './manifests';
import { provideBit } from './bit.provider';

const manifests = Object.values(manifestsMap);

export default {
  name: 'bit',
  dependencies: manifests,
  provider: provideBit
} as ExtensionManifest;
