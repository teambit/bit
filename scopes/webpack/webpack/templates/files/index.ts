import { ComponentContext } from '@teambit/generator';

export function indexFile({ namePascalCase: name }: ComponentContext) {
  return `export { previewConfigTransformer, devServerConfigTransformer } from './${name}.transformer';`;
}
