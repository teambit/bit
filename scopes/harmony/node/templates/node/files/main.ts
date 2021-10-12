import { ComponentContext } from '@teambit/generator';

export function mainFile(context: ComponentContext) {
  return {
    relativePath: `${context.name}.ts`,
    content: `export function ${context.nameCamelCase}() {
  return 'Hello world!';
}`,
  };
}
