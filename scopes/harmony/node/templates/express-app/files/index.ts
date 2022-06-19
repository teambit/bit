import { ComponentContext } from '@teambit/generator';

export function indexFile(context: ComponentContext) {
  return {
    relativePath: 'index.ts',
    content: `export { expressApp } from './${context.name}.app-root';
export type { Route } from './route';
`,
    isMain: true,
  };
}
