import { GeneratorContext } from '@teambit/generator';

export function aspectFile({ componentNameCamelCase, componentId }: GeneratorContext) {
  return `import { Aspect } from '@teambit/harmony';

export const ${componentNameCamelCase}Aspect = Aspect.create({
  id: '${componentId}',
});
  `;
}
