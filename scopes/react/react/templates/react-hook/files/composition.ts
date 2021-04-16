import { ComponentContext } from '@teambit/generator';

export const compositionFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.composition.tsx`,
    content: `import React, { useState } from 'react';

export const Basic${Name} = () => {
  const [count, setCount] = useState(0);

  return (
    <>
      <h1>The number is {count}</h1>
      <button onClick={() => setCount(count + 1)}>increment</button>
    </>
  );
};
`,
  };
};
