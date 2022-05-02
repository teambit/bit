import { ComponentContext } from '@teambit/generator';

export function configFile({ namePascalCase }: ComponentContext) {
  return `
export type ${namePascalCase} = {
};
`;
}
