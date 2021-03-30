import { GeneratorContext } from '@teambit/generator/component-template';

export const indexFile = ({ componentNameCamelCase, componentName }: GeneratorContext) => ({
  relativePath: 'index.ts',
  content: `import { ${componentNameCamelCase}Aspect } from './${componentName}.aspect';

export type { ${componentNameCamelCase}Main } from './${componentName}.main.runtime';
export default ${componentNameCamelCase}Aspect;
export { ${componentNameCamelCase}Aspect };
`,
  isMain: true,
});
