import { GeneratorContext } from '@teambit/generator';

export function indexFile({ namePascalCase, name }: GeneratorContext) {
  return `import { ${namePascalCase}Aspect } from './${name}.aspect';

export type { ${namePascalCase}Main } from './${name}.main.runtime';
export default ${namePascalCase}Aspect;
export { ${namePascalCase}Aspect };
`;
}
