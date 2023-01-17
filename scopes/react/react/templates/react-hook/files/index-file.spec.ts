import { ComponentID } from '@teambit/component-id';
import type { ComponentContext } from '@teambit/generator';
import { indexFile } from './index-file';

// react hook convention is `useX` (lowercase "use")
// it is required to enable hook-specific linting rules
const useFoobarSnapshot = `export { useFooBar } from './use-foo-bar';
`; // trailing line break

describe('templates: react-hook, index-file', () => {
  it('should match snapshot', () => {
    const ctx: ComponentContext = {
      name: 'use-foo-bar',
      namePascalCase: 'UseFooBar',
      nameCamelCase: 'useFooBar',
      componentId: ComponentID.fromString('baz.qux/use/foo/bar'),
      aspectId: ComponentID.fromString('baz.qux/use/foo/my-aspect'),
    };

    const result = indexFile(ctx);

    expect(result.content).toEqual(useFoobarSnapshot);
  });
});
