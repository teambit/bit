import { GeneratorContext } from '@teambit/generator';

export const compositionFile = (context: GeneratorContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.composition.tsx`,
    content: `import React from 'react';
import { ${Name} } from './${name}';

// sets the Component preview in gallery view
export const Basic${Name} = () => {
  return <${Name}>hello from ${Name}</${Name}>;
};
`,
  };
};
