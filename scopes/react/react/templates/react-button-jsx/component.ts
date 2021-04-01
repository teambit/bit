import { GeneratorContext } from '@teambit/generator';

export const componentFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;
  return {
    relativePath: `${name}.jsx`,
    content: `import React from 'react';

export const ${Name} = ( {children, ...rest} ) => {
  return <button {...rest}>{children}</button>
};`,
  };
};
