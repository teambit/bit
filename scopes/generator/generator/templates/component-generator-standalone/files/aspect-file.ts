import { ComponentContext } from '../../..';

export function aspectFile({ namePascalCase, componentId }: ComponentContext) {
  return `import { Aspect } from '@teambit/harmony';

export const ${namePascalCase}Aspect = Aspect.create({
  id: '${componentId}',
});
  `;
}
