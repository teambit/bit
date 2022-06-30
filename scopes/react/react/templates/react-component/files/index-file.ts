import { ComponentContext } from '@teambit/generator';

export const indexFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: 'index.ts',
    content: `export { ${Name} } from './${name}';
export type { ${Name}Props } from './${name}';
`,
  };
};
