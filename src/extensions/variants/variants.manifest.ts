import { ExtensionManifest } from '@teambit/harmony';
import { provideVariants } from './variants.provider';
import { EXT_NAME } from './constants';
import { ConfigExt } from '../config';

export const Variants: ExtensionManifest = {
  name: EXT_NAME,
  dependencies: [ConfigExt],
  provider: provideVariants
};
