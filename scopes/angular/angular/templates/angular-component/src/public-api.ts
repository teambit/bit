import { ComponentContext } from '@teambit/generator';

export const publicApiFile = (context: ComponentContext) => {
  const { name } = context;
  return {
    relativePath: 'public-api.ts',
    content: `/**
 * Entry point for this Angular library, do not move or rename this file.
 */
export * from './src/${name}.component';
export * from './src/${name}.module';
`,
  };
};
