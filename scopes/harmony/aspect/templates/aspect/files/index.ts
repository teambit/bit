import { GeneratorContext } from '@teambit/generator';

export function indexFile({ componentNameCamelCase, componentName }: GeneratorContext) {
  return `import { ${componentNameCamelCase}Aspect } from './${componentName}.aspect';

export type { ${componentNameCamelCase}Main } from './${componentName}.main.runtime';
export default ${componentNameCamelCase}Aspect;
export { ${componentNameCamelCase}Aspect };
`;
}
