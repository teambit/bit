import { ComponentContext } from '@teambit/generator';

export function indexFile({ name }: ComponentContext) {
  return `export { buildConfigTransformer, devConfigTransformer } from './${name}.transformer';`;
}
