import { ComponentContext } from '@teambit/generator';

export function testFile(context: ComponentContext) {
  return {
    relativePath: `${context.name}.spec.ts`,
    content: `import { ${context.nameCamelCase} } from './${context.name}';

it('should return the correct value', () => {
  expect(${context.nameCamelCase}()).toBe('Hello world!');
});`,
  };
}
