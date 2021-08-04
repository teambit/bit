import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.ts`,
    content: `
    export function ${Name}(text : string) {
  return \`<div>\${text}</div>\`;
}
`,
  };
};
