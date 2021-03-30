import { GeneratorContext } from '@teambit/generator';

export const componentFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;
  return {
    relativePath: `${name}.tsx`,
    content: `import React from 'react';

export interface ${Name}Props extends React.HTMLAttributes<HTMLDivElement> {

};

export const ${Name} = ( {children, ...rest}: ${Name}Props ) => {
  return (
    <div {...rest}>
      {children}
    </div>
  )
};`,
  };
};
