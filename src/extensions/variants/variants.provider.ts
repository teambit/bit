import { Variants, Patterns } from './variants';
import { Config } from '../config';

export type VariantsDeps = [Config];

export async function provideVariants([hostConfig]: VariantsDeps, config: Patterns) {
  const variants = new Variants(config, hostConfig);
  // TODO: fix when config become maybe
  if (hostConfig.type) {
    hostConfig.registerGetVariantsConfig(variants.legacy.bind(variants));
    hostConfig.registerGetVariantConfig(variants.legacyById.bind(variants));
  }
  return variants;
}
