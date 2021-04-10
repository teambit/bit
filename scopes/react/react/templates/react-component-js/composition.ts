import { ComponentContext } from '@teambit/generator';

export const compositionFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.composition.jsx`,
    content: `import React from 'react';
import { ${Name} } from './${name}';

export const Basic${Name} = () => (
  <${Name} text="hello from ${Name}" />
);
`,
  };
};
