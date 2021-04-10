import { ComponentContext } from '@teambit/generator';

export function indexFile({ namePascalCase: Name, name }: ComponentContext) {
  return `import { ${Name}Extension } from './${name}.extension';
export { ${Name}Extension };
export default ${Name}Extension;
`;
}
