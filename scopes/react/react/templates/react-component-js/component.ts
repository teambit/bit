import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;
  return {
    relativePath: `${name}.jsx`,
    content: `import React from 'react';

export function ${Name}({ text }) {
  return (
    <div>
      {text}
    </div>
  );
}
`,
  };
};
