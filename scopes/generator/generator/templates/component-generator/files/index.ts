import { ComponentContext } from '@teambit/generator';

export function indexFile({ nameCamelCase, name }: ComponentContext) {
  return `export { ${nameCamelCase}ComponentTemplate } from './${name}';
`;
}
