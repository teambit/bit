import { ComponentContext } from '@teambit/generator';

export function appPlugin({ name }: ComponentContext) {
  return `/** @type {import("@teambit/react.apps.react-app-types").ReactAppOptions} */
module.exports.default = {
  name: "${name}",
  entry: [require.resolve("./${name}.app-root")],
};`;
}
