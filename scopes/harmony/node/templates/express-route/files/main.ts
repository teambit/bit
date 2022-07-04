import { ComponentContext } from '@teambit/generator';

export function mainFile(context: ComponentContext) {
  return {
    relativePath: `${context.name}.ts`,
    content: `export function get${context.namePascalCase}Route() {
  return {
    method: 'get',
    route: '/${context.name}',
    middlewares: [async (req, res) => res.send('${context.name} response')]
  }
}
`,
  };
}
