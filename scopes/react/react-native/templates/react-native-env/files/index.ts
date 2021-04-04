import { GeneratorContext } from '@teambit/generator';

export function indexFile({ namePascalCase: Name, name }: GeneratorContext) {
  return `import { ${Name}Extension } from './${name}.extension';
export { ${Name}Extension };
export default ${Name}Extension;
`;
}
