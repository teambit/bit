import { ComponentContext } from '@teambit/generator';

export function indexFile(context: ComponentContext) {
  return {
    relativePath: 'index.ts',
    content: `export { ${context.nameCamelCase} } from './${context.name}';`,
    isMain: true,
  };
}
