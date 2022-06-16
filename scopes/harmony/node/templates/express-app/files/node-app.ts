import { ComponentContext } from '@teambit/generator';

export function nodeApp(context: ComponentContext) {
  return {
    relativePath: `${context.name}.node-app.ts`,
    content: `import { NodeAppOptions } from '@teambit/node';

export const ${context.nameCamelCase}: NodeAppOptions = {
  name: '${context.name}',
  entry: require.resolve('./${context.name}.app-root'),
  portRange: [3000, 4000]
};

export default ${context.nameCamelCase};
`,
  };
}
