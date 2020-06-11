import { ExtensionManifest } from '@teambit/harmony';
import Isolator from './isolator';
import { PackageManagerExt } from '../package-manager';

export default {
  name: 'Isolator',
  dependencies: [PackageManagerExt],
  config: {},
  provider: Isolator.provide
} as ExtensionManifest;
