import { ComponentContext } from '@teambit/generator';

export function indexFile({ namePascalCase: name }: ComponentContext) {
  return `export { buildConfigTransformer, devConfigTransformer } from './${name}.transformer';`;
}
