import { Variants, Patterns } from './variants';
import { Config } from '../config';

export type VariantsDeps = [Config];

export async function provideVariants([configInstance]: VariantsDeps, config: Patterns) {
  const variants = new Variants(config);
  configInstance.registerGetVariantsConfig(variants.all.bind(variants));
  configInstance.registerGetVariantConfig(variants.getComponentConfig.bind(variants));
  return variants;
}
