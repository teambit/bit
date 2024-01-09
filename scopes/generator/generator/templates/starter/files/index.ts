import { ComponentContext } from '../../..';

export function indexFile({ namePascalCase, name }: ComponentContext) {
  return `export { ${namePascalCase}WorkspaceStarter } from './${name}.starter';
`;
}
