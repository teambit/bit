import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, nameCamelCase: Name } = context;
  return {
    relativePath: `${name}.tsx`,
    content: `import { useState } from 'react';

export function ${Name}() {
  const [count, setCount] = useState(0)
  const increment = () => setCount((c) => c + 1)
  return { count, increment }
}
`,
  };
};
