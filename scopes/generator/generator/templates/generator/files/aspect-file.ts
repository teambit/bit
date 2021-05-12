import { ComponentContext } from '@teambit/generator';

export function aspectFile({ namePascalCase, componentId }: ComponentContext) {
  return `import { Aspect } from '@teambit/bit';

export const ${namePascalCase}Aspect = Aspect.create({
  id: '${componentId}',
});
  `;
}
