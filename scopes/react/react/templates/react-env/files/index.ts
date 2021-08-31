import { ComponentContext } from '@teambit/generator';

export function indexFile({ namePascalCase: Name, name }: ComponentContext) {
  return `import { ${Name}Aspect } from './${name}.aspect';

export type { ${Name}Main } from './${name}.main.runtime';
export default ${Name}Aspect;
export { ${Name}Aspect };
`;
}
