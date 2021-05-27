import { ComponentContext } from '@teambit/generator';

export function indexFile({ name, namePascalCase: Name }: ComponentContext) {
  return `import { ${Name}Aspect } from './${name}.aspect';

export type { ${Name}Main } from './${name}.main.runtime';
export default ${Name}Aspect;
export { ${Name}Aspect };

`;
}
