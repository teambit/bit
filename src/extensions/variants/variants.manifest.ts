import { ExtensionManifest } from '@teambit/harmony';
import { provideVariants } from './variants.provider';
import { EXT_NAME } from './constants';

export const Variants: ExtensionManifest = {
  name: EXT_NAME,
  dependencies: [],
  provider: provideVariants
};
