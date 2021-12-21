import { ComponentContext } from '@teambit/generator';

export function indexFile({ namePascalCase: Name }: ComponentContext) {
  return `export { ${Name}App } from './app';`;
}
