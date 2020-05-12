import { Variants, Patterns } from './variants';

export async function provideVariants(_deps, config: Patterns) {
  const variants = new Variants(config);
  return variants;
}
