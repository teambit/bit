import { ComponentContext } from '@teambit/generator';

export function indexFile(context: ComponentContext) {
  return {
    relativePath: 'index.ts',
    content: `export { get${context.namePascalCase}Route } from './${context.name}';
`,
    isMain: true,
  };
}
