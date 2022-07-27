import { ComponentContext } from '@teambit/generator';

export const indexFile = (context: ComponentContext) => {
  const { name, nameCamelCase: Name } = context;

  return {
    relativePath: 'index.ts',
    content: `export { ${Name} } from './${name}';
`,
  };
};
