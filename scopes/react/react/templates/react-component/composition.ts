import { GeneratorContext } from '@teambit/generator';

export const compositionFile = (context: GeneratorContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.composition.tsx`,
    content: `import React from 'react';
import { ${Name} } from './${name}';

export const Basic${Name} = () => (
  <${Name} text="hello from ${Name}" />
);
`,
  };
};
