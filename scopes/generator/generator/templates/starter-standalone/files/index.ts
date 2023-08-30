import { ComponentContext } from '@teambit/generator';

export function indexFile({ namePascalCase, name }: ComponentContext) {
  return `export { ${namePascalCase}WorkspaceStarter } from './${name}.starter';
`;
}
