import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.jsx`,
    content: `import React from 'react';

export const ${Name} = ( {children, ...rest} ) => {
  return <button {...rest}>{children}</button>
};`,
  };
};
