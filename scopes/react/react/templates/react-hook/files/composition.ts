import { ComponentContext } from '@teambit/generator';

export const compositionFile = (context: ComponentContext) => {
  const { name, nameCamelCase: Name } = context;

  return {
    relativePath: `${name}.composition.tsx`,
    content: `import React from 'react';
import { ${Name} } from './${name}';

export const Basic${Name} = () => {
  const { count, increment } = ${Name}();

  return (
    <>
      <h1>The count is {count}</h1>
      <button onClick={increment}>increment</button>
    </>
  );
};
`,
  };
};
