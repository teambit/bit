import { GeneratorContext } from '@teambit/generator/component-template';

export const aspectFile = ({ componentNameCamelCase, componentName, componentId }: GeneratorContext) => ({
  relativePath: `${componentName}.aspect.ts`,
  content: `import { Aspect } from '@teambit/harmony';

export const ${componentNameCamelCase}Aspect = Aspect.create({
  id: '${componentId}',
});
`,
});
