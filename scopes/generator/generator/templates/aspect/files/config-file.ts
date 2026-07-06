import type { ComponentContext } from '../../../component-template';

export function configFile({ namePascalCase }: ComponentContext) {
  return `
export type ${namePascalCase} = {
};
`;
}
