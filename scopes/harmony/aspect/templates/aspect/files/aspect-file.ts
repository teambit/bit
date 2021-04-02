import { GeneratorContext } from '@teambit/generator';

export function aspectFile({ namePascalCase, componentId }: GeneratorContext) {
  return `import { Aspect } from '@teambit/harmony';

export const ${namePascalCase}Aspect = Aspect.create({
  id: '${componentId}',
});
  `;
}
