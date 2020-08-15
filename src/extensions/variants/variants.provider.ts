// import { Variants, Patterns } from './variants.extension';
// import { Config } from '../config';

// export type VariantsDeps = [Config];

// export async function provideVariants([hostConfig]: VariantsDeps, config: Patterns) {
//   const variants = new Variants(config, hostConfig);
//   // TODO: fix when config become maybe
//   if (hostConfig.type) {
//     hostConfig.registerGetVariantsConfig(variants.legacy.bind(variants));
//   }
//   return variants;
// }
