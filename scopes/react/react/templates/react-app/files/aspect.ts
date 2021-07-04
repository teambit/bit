import { ComponentContext } from '@teambit/generator';

export function aspectFile({ name, namePascalCase: Name }: ComponentContext) {
  return `import { Aspect } from '@teambit/harmony';

export const ${Name}Aspect = Aspect.create({
  id: 'YourOrgName.YourScopeName/namespace?/${name}'
});
`;
}
