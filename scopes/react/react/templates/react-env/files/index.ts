import { GeneratorContext } from '@teambit/generator';

export function indexFile({ componentNameCamelCase: Name, componentName }: GeneratorContext) {
  return `import { ${Name}Extension } from './${componentName}.extension';
export { ${Name}Extension };
export default ${Name}Extension;
`;
}
