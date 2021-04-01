import { GeneratorContext } from '@teambit/generator';

export const compositionFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;

  return {
    relativePath: `${name}.composition.jsx`,
    content: `import React from 'react';
import { ${Name} } from './${name}';

// sets the Component preview in gallery view
export const Basic${Name} = () => {
  return <${Name}>click me</${Name}>;
};
`,
  };
};
