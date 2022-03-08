import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.ts`,
    content: `
export type ${Name}Props = {
  text: string
}
export function ${Name}({text}: ${Name}Props) {
  return \`<div>\${text}</div>\`;
}
`,
  };
};
