import { ComponentContext } from '@teambit/generator';

export function nodeApp(context: ComponentContext) {
  return {
    relativePath: `${context.name}.node-app.cjs`,
    content: `/** @type {import('@teambit/node').NodeAppOptions} */
module.exports.default = {
  name: '${context.name}',
  entry: require.resolve('./${context.name}.app-root'),
  portRange: [3000, 4000]
};`,
  };
}
