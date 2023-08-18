import { ComponentContext } from '@teambit/generator';

export function indexFile({ namePascalCase, name }: ComponentContext) {
  return `export { ${namePascalCase}Starter } from './${name}.starter';
`;
}
