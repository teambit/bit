import { ComponentContext } from '@teambit/generator';

export function indexFile({ name }: ComponentContext) {
  return `export { previewConfigTransformer, devServerConfigTransformer } from './${name}.transformer';`;
}
