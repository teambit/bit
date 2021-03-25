import { ComponentTemplate } from '@teambit/generator/component-template';

export const componentTemplates: ComponentTemplate[] = [
  {
    name: 'react-example-button',
    generateFiles: () => {
      const indexFile = {
        relativePath: 'index.ts',
        content: `export { Button }  from './button';`,
      };
      const componentFile = {
        relativePath: 'button.tsx',
        content: `import React from 'react';

export type ButtonProps = {
  text: string;
};

export const Button = ({
  text
}: ButtonProps) => {
  return <button>{text}</button>
};`,
      };
      const compositionFile = {
        relativePath: 'button.composition.tsx',
        content: `import React from 'react';
import { Button } from './button';

export const BasicButton = () => {
  return <Button text="click me" />;
};
`,
      };
      const docsFile = {
        relativePath: 'button.docs.mdx',
        content: `---
labels: ['react', 'typescript', 'ui', 'button']
description: 'A Button component.'
---

import { Button } from './button';

Button example:

// Uncomment out the code below by removing the '//'
// \`\`\`js live
<Button text="click here"/>
// \`\`\`
`,
      };

      return [indexFile, componentFile, compositionFile, docsFile];
    },
  },
];
