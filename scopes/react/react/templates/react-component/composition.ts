import { GeneratorContext } from '@teambit/generator/component-template';

export const compositionFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;

  return {
    relativePath: `${name}.composition.tsx`,
    content: `import React from 'react';
import { ${Name} } from './${name}';

// sets the Component preview in gallery view live now with David
export const Basic${Name} = () => {
  return <${Name}>hello from ${Name}</${Name}>;
};
`,
  };
};
