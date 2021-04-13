import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.tsx`,
    content: `import React from 'react';

export type ${Name}Props = {
  /**
   * a text to be rendered in the component.
   */
  text: string
};

export function ${Name}({ text }: ${Name}Props) {
  return (
    <div>
      {text}
    </div>
  );
}
`,
  };
};
