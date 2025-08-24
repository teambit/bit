import type { ComponentContext } from '../../../component-template';

export function indexFile({ namePascalCase, name }: ComponentContext) {
  return `export { ${namePascalCase}ComponentTemplate } from './${name}';
`;
}
