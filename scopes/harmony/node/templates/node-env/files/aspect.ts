import { ComponentContext } from '@teambit/generator';

export function aspectFile({ namePascalCase: Name, componentId }: ComponentContext) {
  return `import { Aspect } from '@teambit/harmony';

export const ${Name}Aspect = Aspect.create({
  id: '${componentId}',
});
`;
}
