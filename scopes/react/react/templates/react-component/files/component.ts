import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.tsx`,
    content: `import React, { ReactNode } from 'react';

export type ${Name}Props = {
  /**
   * a node to be rendered in the special component.
   */
  children?: ReactNode;
};

export function ${Name}({ children }: ${Name}Props) {
  return (
    <div>
      {children}
    </div>
  );
}
`,
  };
};
