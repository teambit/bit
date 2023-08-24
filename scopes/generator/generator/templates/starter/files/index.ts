import { ComponentContext } from '../../../';

export function indexFile({ namePascalCase, name }: ComponentContext) {
  return `export { starter as ${namePascalCase}Starter } from './${name}.starter';
`;
}
