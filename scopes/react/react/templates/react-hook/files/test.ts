import { ComponentContext } from '@teambit/generator';

export const testFile = (context: ComponentContext) => {
  const { name, nameCamelCase: Name } = context;

  return {
    relativePath: `${name}.spec.tsx`,
    content: `import { renderHook, act } from '@testing-library/react-hooks';
import { ${Name} } from './${name}';

it('should increment counter', () => {
  const { result } = renderHook(() => ${Name}())
  act(() => {
    result.current.increment()
  })
  expect(result.current.count).toBe(1)
})
`,
  };
};
